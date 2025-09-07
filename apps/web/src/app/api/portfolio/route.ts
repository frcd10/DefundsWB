import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    console.log('=== GET USER PORTFOLIO API CALLED ===');
    
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('walletAddress'); // Changed from 'wallet' to 'walletAddress'

    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address is required',
      }, { status: 400 });
    }

    console.log('Getting portfolio for wallet:', walletAddress);

    // Connect to MongoDB
    const client = await getClientPromise();
  const db = client.db('Defunds'); // Match the database name used everywhere else
  const fundsCollection = db.collection('Funds'); // Match the collection name used everywhere else
  const rwaCollection = db.collection('Rwa');

    // Get all funds where this wallet is involved
    const funds = await fundsCollection.find({
      $or: [
        { manager: walletAddress }, // Funds managed by this wallet
        { 'investments.walletAddress': walletAddress } // Funds invested in by this wallet
      ]
    }).toArray();

    console.log('Found funds for wallet:', funds.length);

    // Transform funds into portfolio positions
    const positions = funds.map(fund => {
      console.log('Processing fund:', fund.name, 'for wallet:', walletAddress);
      
      const isManager = fund.manager === walletAddress;
      let userShares = 0;
      let totalInvested = 0;
      let investmentHistory: Array<{ walletAddress: string; amount: number; shares: number; timestamp: string; transactionSignature: string; type: string }> = [];

      if (fund.investments && fund.investments.length > 0) {
        // Find all investments by this wallet
        const userInvestments = fund.investments.filter((inv: { walletAddress: string }) => 
          inv.walletAddress === walletAddress
        );
        
        console.log('Found user investments:', userInvestments.length);
        
        if (userInvestments.length > 0) {
          userShares = userInvestments.reduce((sum: number, inv: { shares?: number }) => sum + (inv.shares || 0), 0);
          totalInvested = userInvestments.reduce((sum: number, inv: { amount?: number }) => sum + (inv.amount || 0), 0);
          investmentHistory = userInvestments;
        }
      } else if (isManager) {
        // If no investments array but user is manager, they have the initial position
        userShares = fund.totalShares || 0;
        totalInvested = fund.totalDeposits || 0;
      }

      if (userShares <= 0) {
        return null; // Skip if no position
      }

      const sharePercentage = fund.totalShares > 0 ? (userShares / fund.totalShares) * 100 : 0;
      
      // Calculate current value based on current fund value and user's share percentage
      const currentValue = fund.currentValue 
        ? (fund.currentValue * (userShares / fund.totalShares))
        : totalInvested; // Fallback to invested amount if no current value
      
      // Calculate P&L (difference between current value and what was invested)
      // const pnl = currentValue - totalInvested;
      // Remove unused variable
      // const pnlPercentage = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      // Calculate user's total withdrawals from this fund
      let totalWithdrawals = 0;
      if (fund.withdrawals && fund.withdrawals.length > 0) {
        const userWithdrawals = fund.withdrawals.filter((withdrawal: { walletAddress: string }) => 
          withdrawal.walletAddress === walletAddress
        );
        totalWithdrawals = userWithdrawals.reduce((sum: number, withdrawal: { amount?: number }) => 
          sum + (withdrawal.amount || 0), 0
        );
      }

      console.log('Position calculated:');
      console.log('- User shares:', userShares);
      console.log('- Total invested:', totalInvested);
      console.log('- Total withdrawn:', totalWithdrawals);
      console.log('- Current value:', currentValue);

      return {
        fundId: fund._id,
        fundName: fund.name,
        fundType: fund.fundType || 'General',
        sharePercentage,
        userShares,
        totalShares: fund.totalShares || 0,
        currentValue,
        initialInvestment: totalInvested,
        totalWithdrawals,
        investmentHistory,
        lastUpdated: fund.updatedAt ? new Date(fund.updatedAt).toISOString() : new Date().toISOString()
      };
    }).filter(position => position !== null); // Remove null positions

    console.log('Final positions:', positions.length);

    // RWA positions for this wallet (investments only)
    const rwaDocs = await rwaCollection.find({ 'investments.walletAddress': walletAddress }).toArray();
    console.log('Found RWA products with investments from wallet:', rwaDocs.length);

    const rwaPositions = rwaDocs.map((p: any) => {
      const userInvestments = (p.investments || []).filter((inv: any) => inv.walletAddress === walletAddress);
      if (userInvestments.length === 0) return null;

      const userShares = userInvestments.reduce((sum: number, inv: any) => sum + (inv.shares || 0), 0);
      const invested = userInvestments.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
      const totalShares = p.totalShares || 0;
      const currentValue = p.currentValue || 0;
      const expectedReturn = totalShares > 0 ? (userShares / totalShares) * currentValue : invested;

      return {
        fundId: p.fundId,
        name: p.name,
        type: p.fundType || 'General',
        invested,
        expectedReturn,
        userShares,
        totalShares,
        lastUpdated: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      };
    }).filter(Boolean);

    // Calculate total portfolio values
    const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
    const totalInvested = positions.reduce((sum, pos) => sum + pos.initialInvestment, 0);
    const totalWithdrawn = positions.reduce((sum, pos) => sum + pos.totalWithdrawals, 0);
    
    // New P&L calculation: P&L = Total Value + Total Withdrawn - Total Invested
    const totalPnL = totalValue + totalWithdrawn - totalInvested;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    console.log('Portfolio totals:');
    console.log('- Total Value:', totalValue);
    console.log('- Total Invested:', totalInvested);
    console.log('- Total Withdrawn:', totalWithdrawn);
    console.log('- Total P&L:', totalPnL);

    return NextResponse.json({
      success: true,
      data: {
        totalValue,
        totalInvested,
        totalWithdrawn,
        totalPnL,
        totalPnLPercentage,
  activeFunds: positions.length,
  positions,
  rwaPositions,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('=== ERROR GETTING PORTFOLIO ===');
    console.error('Error details:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get portfolio',
    }, { status: 500 });
  }
}
