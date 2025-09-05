import { Router } from 'express';
import { solanaService } from '../services/solana';
import { z } from 'zod';

const router = Router();

// Validation schemas
const getTradesSchema = z.object({
  fund: z.string().optional(),
  limit: z.string().optional().default('100'),
  page: z.string().optional().default('1'),
});

// GET /api/trades - Get all trades with optional filtering
router.get('/', async (req, res) => {
  try {
    const { fund, limit, page } = getTradesSchema.parse(req.query);
    const limitNum = parseInt(limit);
    const pageNum = parseInt(page);

    const trades = await solanaService.getTrades(fund, limitNum);
    
    // Simple pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedTrades = trades.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        trades: paginatedTrades,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: trades.length,
          pages: Math.ceil(trades.length / limitNum),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trades',
    });
  }
});

// GET /api/trades/recent - Get recent trades across all funds
router.get('/recent', async (req, res) => {
  try {
    const { limit = '20' } = req.query;
    
    const trades = await solanaService.getTrades(undefined, parseInt(limit as string));

    res.json({
      success: true,
      data: trades,
    });
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent trades',
    });
  }
});

export { router as tradeRoutes };
