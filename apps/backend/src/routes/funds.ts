import { Router } from 'express';
import { solanaService } from '../services/solana';
import getClientPromise from '../lib/mongodb';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createFundSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
  fundType: z.string(),
  performanceFee: z.number().min(0).max(50),
  maxCapacity: z.number().min(0),
  isPublic: z.boolean(),
});

const createRealFundSchema = z.object({
  fundId: z.string(),
  manager: z.string(),
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
  fundType: z.string(),
  performanceFee: z.number().min(0).max(50).optional(),
  maxCapacity: z.number().min(0).optional(),
  isPublic: z.boolean().optional(),
  signature: z.string(),
  initialDeposit: z.number().min(0).optional(),
});

const paginationSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
});

// GET /api/funds - Get all funds
router.get('/', async (req, res) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const funds = await solanaService.getFunds();
    
    // Simple pagination
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedFunds = funds.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        funds: paginatedFunds,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: funds.length,
          pages: Math.ceil(funds.length / limitNum),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching funds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch funds',
    });
  }
});

// GET /api/funds/:fundId - Get specific fund
router.get('/:fundId', async (req, res) => {
  try {
    const { fundId } = req.params;

    const fund = await solanaService.getFund(fundId);

    if (!fund) {
      return res.status(404).json({
        success: false,
        error: 'Fund not found',
      });
    }

    return res.json({
      success: true,
      data: fund,
    });
  } catch (error) {
    console.error('Error fetching fund:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch fund',
    });
  }
});

// GET /api/funds/:fundId/positions - Get investor positions for a fund
router.get('/:fundId/positions', async (req, res) => {
  try {
    const { fundId } = req.params;
    const { investor } = req.query;

    if (!investor) {
      return res.status(400).json({
        success: false,
        error: 'Investor address is required',
      });
    }

    const position = await solanaService.getInvestorPosition(
      investor as string,
      fundId
    );

    return res.json({
      success: true,
      data: position,
    });
  } catch (error) {
    console.error('Error fetching investor position:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch investor position',
    });
  }
});

// GET /api/funds/:fundId/trades - Get trades for a specific fund
router.get('/:fundId/trades', async (req, res) => {
  try {
    const { fundId } = req.params;
    const { limit = '50' } = req.query;

    const trades = await solanaService.getTrades(fundId, parseInt(limit as string));

    res.json({
      success: true,
      data: trades,
    });
  } catch (error) {
    console.error('Error fetching fund trades:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fund trades',
    });
  }
});

// GET /api/funds/:fundId/performance - Get fund performance metrics
router.get('/:fundId/performance', async (req, res) => {
  try {
    const { fundId } = req.params;
    const { timeframe = '1D' } = req.query;

    // TODO: Implement performance calculation service
    const mockPerformance = {
      totalReturn: 0.0,
      totalReturnPercentage: 0.0,
      dailyReturn: 0.0,
      weeklyReturn: 0.0,
      monthlyReturn: 0.0,
      sharpeRatio: 0.0,
      maxDrawdown: 0.0,
      volatility: 0.0,
      timeframe: timeframe as string,
    };

    res.json({
      success: true,
      data: mockPerformance,
    });
  } catch (error) {
    console.error('Error fetching fund performance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fund performance',
    });
  }
});

// POST /api/funds/create - Create a real fund on Solana and store in DB
router.post('/create', async (req, res) => {
  try {
    const validationResult = createRealFundSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const {
      fundId,
      manager,
      name,
      description,
      fundType,
      performanceFee = 0,
      maxCapacity = 0,
      isPublic = true,
      signature,
      initialDeposit = 0
    } = validationResult.data;

    // Verify the transaction on Solana
    const verified = await solanaService.verifyTransaction(signature);
    if (!verified) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction signature',
      });
    }

    // Store fund in MongoDB
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    // Check if fund already exists
    const existingFund = await collection.findOne({ fundId });
    if (existingFund) {
      return res.status(409).json({
        success: false,
        error: 'Fund already exists',
      });
    }

    const fundData = {
      fundId,
      manager,
      name,
      description,
      fundType,
      performanceFee,
      maxCapacity,
      isPublic,
      signature,
      totalDeposits: initialDeposit,
      totalShares: initialDeposit,
      investorCount: initialDeposit > 0 ? 1 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      performance: [{
        date: new Date().toISOString(),
        nav: initialDeposit
      }],
      stats: {
        total: 0,
        wins: 0,
        losses: 0,
        avgWinPct: 0,
        avgWinSol: 0,
        avgLossPct: 0,
        avgLossSol: 0,
        drawdownPct: 0,
        drawdownSol: 0,
        topWins: [],
        topLosses: []
      }
    };

    const result = await collection.insertOne(fundData);

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId,
        ...fundData
      },
    });
  } catch (error) {
    console.error('Error creating real fund:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create fund',
    });
  }
});

// GET /api/funds/real - Get all real funds from database
router.get('/real', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get funds from MongoDB
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    const funds = await collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalCount = await collection.countDocuments();

    return res.json({
      success: true,
      data: {
        funds,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching real funds:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch funds',
    });
  }
});

export { router as fundRoutes };
