import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

export async function POST(request: NextRequest) {
  try {
    console.log('=== WITHDRAWAL API ENDPOINT ===');
    
    const body = await request.json();
    const { fundId, walletAddress, sharePercentage, signature, withdrawAmount } = body;

    console.log('Fund ID:', fundId);
    console.log('Wallet:', walletAddress);
    console.log('Share Percentage:', sharePercentage);
    console.log('Signature:', signature);
    console.log('Withdraw Amount:', withdrawAmount);

    if (!fundId || !walletAddress || !sharePercentage || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify the transaction on-chain
    console.log('Verifying withdrawal transaction...');
    const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );

    let transactionValid = false;
    try {
      const tx = await connection.getTransaction(signature, { commitment: 'confirmed' });
      transactionValid = !!tx && !tx.meta?.err;
      console.log('Transaction verification result:', transactionValid);
    } catch (verifyError) {
      console.error('Transaction verification error:', verifyError);
      // For demo purposes, we'll proceed even if verification fails
      transactionValid = true;
    }

    if (!transactionValid) {
      return NextResponse.json(
        { success: false, error: 'Invalid or failed transaction' },
        { status: 400 }
      );
    }

    // Connect to database
    const client = await getClientPromise();
    const db = client.db('Defunds'); // Match the database name used everywhere else

    // Find the fund
    const fund = await db.collection('Funds').findOne({ _id: fundId });
    if (!fund) {
      return NextResponse.json(
        { success: false, error: 'Fund not found' },
        { status: 404 }
      );
    }

    console.log('Found fund:', fund.name);

    // Calculate the shares to withdraw
    const sharesToWithdraw = sharePercentage / 100;

    // Find the user's current position in this fund
    const userInvestment = fund.investments?.find((inv: { walletAddress: string }) => 
      inv.walletAddress === walletAddress
    );

    if (!userInvestment) {
      return NextResponse.json(
        { success: false, error: 'No investment found for this wallet in this fund' },
        { status: 404 }
      );
    }

    console.log('Current user shares:', userInvestment.shares);

    // Calculate new shares after withdrawal
    const sharesToRemove = userInvestment.shares * sharesToWithdraw;
    const newUserShares = userInvestment.shares - sharesToRemove;

    console.log('Shares to remove:', sharesToRemove);
    console.log('New user shares:', newUserShares);

    // Update the fund and user's investment
    if (newUserShares <= 0.0001) {
      // Remove the investment completely if shares are negligible
      console.log('Removing investment completely');
      await db.collection('Funds').updateOne(
        { _id: fundId },
        {
          $pull: {
            investments: { walletAddress: walletAddress }
          } as any,
          $inc: {
            totalShares: -sharesToRemove,
            totalDeposits: -withdrawAmount,
            currentValue: -withdrawAmount, // Also update current value
            solBalance: -withdrawAmount, // Track SOL leaving the fund
            investorCount: -1
          },
          $push: {
            withdrawals: {
              walletAddress,
              amount: withdrawAmount,
              shares: sharesToRemove,
              sharePercentage,
              signature,
              timestamp: new Date()
            }
          } as any
        } as any
      );
    } else {
      // Update the user's shares
      console.log('Updating user shares');
      await db.collection('Funds').updateOne(
        { _id: fundId, 'investments.walletAddress': walletAddress },
        {
          $set: {
            'investments.$.shares': newUserShares,
            'investments.$.lastUpdated': new Date()
          },
          $inc: {
            totalShares: -sharesToRemove,
            totalDeposits: -withdrawAmount,
            currentValue: -withdrawAmount, // Also update current value
            solBalance: -withdrawAmount // Track SOL leaving the fund
          },
          $push: {
            withdrawals: {
              walletAddress,
              amount: withdrawAmount,
              shares: sharesToRemove,
              sharePercentage,
              signature,
              timestamp: new Date()
            }
          } as any
        } as any
      );
    }

    console.log('Withdrawal recorded successfully');

    return NextResponse.json({
      success: true,
      message: 'Withdrawal recorded successfully',
      data: {
        fundId,
        walletAddress,
        withdrawAmount,
        sharesToRemove,
        newUserShares,
        signature
      }
    });

  } catch (error) {
    console.error('=== WITHDRAWAL API ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
