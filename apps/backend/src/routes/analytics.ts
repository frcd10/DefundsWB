import { Router } from 'express';
import { solanaService } from '../services/solana';

const router = Router();

// GET /api/analytics/overview - Platform overview stats
router.get('/overview', async (req, res) => {
  try {
    const funds = await solanaService.getFunds();
    const trades = await solanaService.getTrades(undefined, 1000); // Last 1000 trades

    // Calculate platform stats
    const totalFunds = funds.length;
    const totalAssets = funds.reduce((sum, fund) => {
      return sum + parseInt(fund.totalAssets || '0');
    }, 0);
    
    const totalTrades = trades.length;
    const recentTrades = trades.filter(trade => {
      const tradeDate = new Date(parseInt(trade.timestamp) * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return tradeDate > oneDayAgo;
    }).length;

    res.json({
      success: true,
      data: {
        totalFunds,
        totalAssets,
        totalTrades,
        recentTrades,
        averageFundSize: totalFunds > 0 ? totalAssets / totalFunds : 0,
      },
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics overview',
    });
  }
});

// GET /api/analytics/top-funds - Top performing funds
router.get('/top-funds', async (req, res) => {
  try {
    const { limit = '10', sortBy = 'totalAssets' } = req.query;
    
    const funds = await solanaService.getFunds();
    
    // Sort funds based on criteria
    const sortedFunds = funds.sort((a, b) => {
      if (sortBy === 'totalAssets') {
        return parseInt(b.totalAssets || '0') - parseInt(a.totalAssets || '0');
      } else if (sortBy === 'totalShares') {
        return parseInt(b.totalShares || '0') - parseInt(a.totalShares || '0');
      }
      return 0;
    });

    const topFunds = sortedFunds.slice(0, parseInt(limit as string));

    res.json({
      success: true,
      data: topFunds,
    });
  } catch (error) {
    console.error('Error fetching top funds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top funds',
    });
  }
});

// GET /api/analytics/trading-volume - Trading volume over time
router.get('/trading-volume', async (req, res) => {
  try {
    const { timeframe = '1D' } = req.query;
    
    const trades = await solanaService.getTrades(undefined, 1000);
    
    // Group trades by time periods
    const volumeData = trades.reduce((acc: any[], trade) => {
      const tradeDate = new Date(parseInt(trade.timestamp) * 1000);
      const dateKey = tradeDate.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const existing = acc.find(item => item.date === dateKey);
      if (existing) {
        existing.volume += parseInt(trade.amountIn || '0');
        existing.trades += 1;
      } else {
        acc.push({
          date: dateKey,
          volume: parseInt(trade.amountIn || '0'),
          trades: 1,
        });
      }
      
      return acc;
    }, []);

    res.json({
      success: true,
      data: volumeData.sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error('Error fetching trading volume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trading volume',
    });
  }
});

export { router as analyticsRoutes };
