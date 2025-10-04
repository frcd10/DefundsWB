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

// WebSocket handler
wss.on('connection', websocketHandler);

// Error handling
app.use(errorHandler);

async function startServer() {
  try {
    // Initialize Solana connection
    await solanaService.initialize();
    console.log('✅ Solana connection established');

    // Kick off points updater on startup and schedule hourly
    const runPoints = async () => {
      try {
        await updateHourlyPoints();
      } catch (e) {
        console.error('Points update failed', e);
      }
    };
    // Run once at start, then every hour
    runPoints();
    setInterval(runPoints, 60 * 60 * 1000);

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
