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

// WebSocket handler
wss.on('connection', websocketHandler);

// Error handling
app.use(errorHandler);

async function startServer() {
  try {
    // Initialize Solana connection
    await solanaService.initialize();
    console.log('✅ Solana connection established');

    // Schedule points updater to run only at minute 0 of each hour
    let lastRunKey: string | null = null; // e.g., '2025-10-07T13'
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      if (next <= now) {
        // If we've already passed the top of this hour, schedule next hour
        next.setHours(next.getHours() + 1);
      }
      const delay = next.getTime() - now.getTime();
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
          // reschedule for the next top of the hour
          schedule();
        }
      }, delay);
    };
    // Start scheduling without running immediately
    schedule();

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
