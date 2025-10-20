import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Get funds from MongoDB
    const client = await getClientPromise();
    const db = client.db('Defunds'); // Changed to match fund creation API
    const collection = db.collection('Funds'); // Changed to match fund creation API


    const funds = await collection
      // Exclude devnet funds from the public listing
      .find({ cluster: { $ne: 'devnet' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    

  const totalCount = await collection.countDocuments();

    // Transform funds to match expected format
    const transformedFunds = funds.map(fund => {
      const accessMode = fund.accessMode || fund.access?.type || (fund.isPublic === false ? 'single_code' : 'public');
      
      return {
        id: fund._id,
        fundId: fund.fundId,
        name: fund.name,
        description: fund.description,
        type: fund.fundType || 'General',
        manager: fund.manager,
        tvl: fund.totalDeposits || 0, // Show TVL value
        perfFee: fund.performanceFee || 0,
        investorCount: fund.investorCount || 0,
        maxCapacity: fund.maxCapacity || 0,
        isPublic: accessMode === 'public',
        inviteOnly: accessMode !== 'public',
        accessMode, // expose access mode (front-end can decide wording); DOES NOT expose actual codes
        
        // Performance data for PnL curve (will be flat until trading is added)
        performance: fund.performanceHistory || [{
          date: new Date().toISOString(),
          nav: 1.0, // Start at 1.0 (neutral)
          pnl: 0, // P&L starts at 0 (no trading gains/losses)
          pnlPercentage: 0 // 0% performance since no trading
        }],
        
        // Trading stats (will be empty until trading is added)
        stats: fund.stats || {
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
    });

    
    
    return NextResponse.json({
      success: true,
      data: {
        funds: transformedFunds,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });

  } catch (error) {
    console.error('=== ERROR FETCHING REAL FUNDS ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch funds',
    }, { status: 500 });
  }
}
