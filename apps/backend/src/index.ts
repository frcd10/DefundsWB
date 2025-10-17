import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import { fundRoutes } from './routes/funds';
import { tradeRoutes } from './routes/trades';
import { analyticsRoutes } from './routes/analytics';
import { pricesRoutes } from './routes/prices';
import { solanaService } from './services/solana';
import { swapRoutes } from './routes/swap';
import { websocketHandler } from './websocket/handler';
import { rpcProxyHandler } from './websocket/rpcProxy';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { updateHourlyPoints } from './services/points';
import getClientPromise from './lib/mongodb';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const IS_DEV = process.env.NODE_ENV !== 'production';

// Middleware
app.use(helmet());
const corsOrigins = (() => {
  if (process.env.CORS_ALLOW_ALL === 'true' || IS_DEV) return true;
  const fromEnv = process.env.CORS_ORIGINS || process.env.FRONTEND_URL;
  if (!fromEnv) return 'http://localhost:3000';
  const list = fromEnv.split(',').map(s => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
})();

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic ping useful for dev debugging
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, service: 'backend', port: PORT, time: Date.now() });
});

// API Routes
app.use('/api/funds', fundRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/prices', pricesRoutes);
app.use('/api/swap', swapRoutes);
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

// WebSocket handlers: route by URL
wss.on('connection', (ws, req) => {
  try {
    if (req.url && req.url.startsWith('/ws/rpc')) {
      rpcProxyHandler(ws);
    } else {
      websocketHandler(ws);
    }
  } catch (e) {
    console.error('WS connection handler error', e);
    try { ws.close(1011, 'Server error'); } catch {}
  }
});

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
