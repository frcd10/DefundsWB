import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import { fundRoutes } from './routes/funds';
import { tradeRoutes } from './routes/trades';
import { analyticsRoutes } from './routes/analytics';
import { solanaService } from './services/solana';
import { websocketHandler } from './websocket/handler';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { updateHourlyPoints } from './services/points';
import getClientPromise from './lib/mongodb';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/funds', fundRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/analytics', analyticsRoutes);
// Points maintenance (admin-lite): trigger on-demand update
app.post('/api/admin/points/run', async (req, res) => {
  try {
    await updateHourlyPoints();
    res.json({ ok: true });
  } catch (e) {
    console.error('Manual points run failed', e);
    res.status(500).json({ ok: false });
  }
});
// Inspect current hourly lock status (for debugging)
app.get('/api/admin/points/status', async (req, res) => {
  try {
    const client = await getClientPromise();
    const meta = client.db('Defunds').collection<any>('Meta');
    const lock = await meta.findOne({ _id: 'points-hourly-lock' });
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}`;
    res.json({ ok: true, lock, currentUtcHourKey: hourKey, serverTime: now.toISOString() });
  } catch (e) {
    console.error('Points status fetch failed', e);
    res.status(500).json({ ok: false });
  }
});

// WebSocket handler
wss.on('connection', websocketHandler);

// Error handling
app.use(errorHandler);

async function startServer() {
  try {
    // Initialize Solana connection
    await solanaService.initialize();
    console.log('✅ Solana connection established');

    // Schedule points updater to run at the top of the UTC hour
    let lastRunKey: string | null = null; // e.g., '2025-10-07T13'

    const scheduleNextUtcHour = () => {
      const now = new Date();
      const nextHourUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        now.getUTCHours() + 1,
        0,
        0,
        0
      );
      const delay = nextHourUtc - now.getTime();
      const when = new Date(nextHourUtc).toISOString();
      console.log(`Points updater: scheduling next run in ${Math.round(delay/1000)}s at ${when}`);

      setTimeout(async () => {
        try {
          const runAt = new Date();
          const key = `${runAt.getUTCFullYear()}-${String(runAt.getUTCMonth()+1).padStart(2,'0')}-${String(runAt.getUTCDate()).padStart(2,'0')}T${String(runAt.getUTCHours()).padStart(2,'0')}`;
          if (lastRunKey !== key) {
            await updateHourlyPoints();
            lastRunKey = key;
          } else {
            console.log('Points updater: skipped duplicate hour run for', key);
          }
        } catch (e) {
          console.error('Points update failed', e);
        } finally {
          // Always reschedule for the next UTC hour
          scheduleNextUtcHour();
        }
      }, Math.max(0, delay));
    };

    // Optional: immediate catch-up run on startup if current UTC hour hasn't been processed
    try {
      const now = new Date();
      const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}`;
      const client = await getClientPromise();
      const meta = client.db('Defunds').collection<any>('Meta');
      const lock = await meta.findOne({ _id: 'points-hourly-lock' });
      if (lock?.lastRunKey !== currentKey) {
        console.log('Points updater: performing immediate catch-up run for hour', currentKey);
        await updateHourlyPoints();
        lastRunKey = currentKey;
      } else {
        console.log('Points updater: current UTC hour already processed, no immediate run');
      }
    } catch (e) {
      console.warn('Points updater: startup catch-up check failed (will continue with schedule)', e);
    }

    // Start scheduling for the next UTC hour
    scheduleNextUtcHour();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 WebSocket server ready`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export { app, wss };
