import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

// Validation function
function validateInvestmentRequest(body: Record<string, unknown>) {
  const required = ['fundId', 'investorWallet', 'amount', 'signature'];
  for (const field of required) {
    if (!body[field]) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

// Verify transaction on Solana
async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    console.log('Verifying investment transaction:', signature);
    
    if (signature.startsWith('mock_')) {
      console.log('ERROR: Mock signatures are no longer accepted');
      return false;
    }

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    const isValid = transaction !== null;
    console.log('Investment transaction verification result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('Error verifying investment transaction:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('=== FUND INVESTMENT API CALLED ===');
    
    const body = await req.json();
    console.log('Investment request body:', body);
    
    // Validate required fields
    const validationError = validateInvestmentRequest(body);
    if (validationError) {
      console.log('Validation error:', validationError);
      return NextResponse.json({
        success: false,
        error: validationError,
      }, { status: 400 });
    }

    const {
      fundId,
      investorWallet,
      amount,
      signature
    } = body;

    // Verify the transaction on Solana
    console.log('Verifying investment transaction:', signature);
    const verified = await verifyTransaction(signature);
    console.log('Investment transaction verified:', verified);
    
    if (!verified) {
      console.log('Investment transaction verification failed');
      return NextResponse.json({
        success: false,
        error: 'Invalid transaction signature',
      }, { status: 400 });
    }

    // Update fund in MongoDB
    console.log('Connecting to MongoDB...');
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    // Find the fund
    console.log('Finding fund with ID:', fundId);
    const fund = await collection.findOne({ fundId });
    if (!fund) {
      console.log('Fund not found');
      return NextResponse.json({
        success: false,
        error: 'Fund not found',
      }, { status: 404 });
    }

    console.log('Updating fund with new investment...');
    
    // Calculate shares based on current NAV (Net Asset Value)
    // NAV per share = current fund value / total shares outstanding
    const currentNavPerShare = fund.currentValue && fund.totalShares > 0 
      ? fund.currentValue / fund.totalShares 
      : 1.0;
    
    // Shares to issue = investment amount / NAV per share
    const sharesToIssue = amount / currentNavPerShare;
    
    console.log('=== SHARE CALCULATION ===');
    console.log('Fund current state:');
    console.log('- Current value:', fund.currentValue, 'SOL');
    console.log('- Total shares:', fund.totalShares);
    console.log('- NAV per share:', currentNavPerShare);
    console.log('New investment:');
    console.log('- Amount invested:', amount, 'SOL');
    console.log('- Shares to issue:', sharesToIssue);
    console.log('After investment:');
    console.log('- New current value:', fund.currentValue + amount, 'SOL');
    console.log('- New total shares:', fund.totalShares + sharesToIssue);
    console.log('- New NAV per share:', (fund.currentValue + amount) / (fund.totalShares + sharesToIssue));
    
    // Verify NAV stays constant (should be ~1.0 for deposits)
    const newNavPerShare = (fund.currentValue + amount) / (fund.totalShares + sharesToIssue);
    console.log('NAV per share should remain constant:', currentNavPerShare, '→', newNavPerShare);
    
    // Calculate new totals
    const newTotalDeposits = fund.totalDeposits + amount;
    const newTotalShares = fund.totalShares + sharesToIssue;
    const newCurrentValue = fund.currentValue + amount; // TVL increases by deposit amount
    
    // Check if this is an existing investor
    const isExistingInvestor = fund.investments && fund.investments.some((inv: { walletAddress: string }) => 
      inv.walletAddress === investorWallet
    );
    const newInvestorCount = isExistingInvestor ? fund.investorCount : fund.investorCount + 1;

    // Create investment record
    const investmentRecord = {
      walletAddress: investorWallet,
      amount: amount,
      shares: sharesToIssue,
      navAtTime: currentNavPerShare,
      timestamp: new Date(),
      transactionSignature: signature,
      type: 'investment'
    };

    // Update the fund with investment tracking
    const updateResult = await db.collection('Funds').updateOne(
      { fundId },
      {
        $set: {
          totalDeposits: newTotalDeposits,
          totalShares: newTotalShares,
          currentValue: newCurrentValue,
          investorCount: newInvestorCount,
          updatedAt: new Date()
        },
        // Increase explicit SOL balance tracking (used by trader UI) by deposit amount
        $inc: {
          solBalance: amount
        },
        $push: {
          investments: investmentRecord,
          performanceHistory: {
            date: new Date().toISOString(),
            tvl: newTotalDeposits,
            nav: newNavPerShare,
            pnl: newCurrentValue - newTotalDeposits, // Current PnL (should be 0 for deposits only)
            pnlPercentage: newTotalDeposits > 0 ? ((newCurrentValue - newTotalDeposits) / newTotalDeposits) * 100 : 0
          }
        }
      } as any // eslint-disable-line @typescript-eslint/no-explicit-any -- MongoDB operation type assertion
    );

    if (updateResult.matchedCount === 0) {
      console.log('Failed to update fund');
      return NextResponse.json({
        success: false,
        error: 'Failed to update fund',
      }, { status: 500 });
    }

    console.log('Investment processed successfully');

    return NextResponse.json({
      success: true,
      data: {
        fundId,
        investorWallet,
        amount,
        signature,
        newTotalDeposits,
        newTotalShares,
        newInvestorCount
      },
    }, { status: 201 });

  } catch (error) {
    console.error('=== ERROR PROCESSING INVESTMENT ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process investment',
    }, { status: 500 });
  }
}
