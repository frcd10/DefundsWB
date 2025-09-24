import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, PublicKey } from '@solana/web3.js';

// Validation function
function validateCreateFundRequest(body: Record<string, unknown>) {
  const required = ['fundId', 'manager', 'name', 'signature'];
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
    console.log('Verifying real Solana transaction:', signature);
    
    // No more mock signatures - only real ones
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
    console.log('Transaction verification result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('=== CREATE FUND API CALLED ===');
    
    const body = await req.json();
    console.log('Request body:', body);
    
    // Validate required fields
    const validationError = validateCreateFundRequest(body);
    if (validationError) {
      console.log('Validation error:', validationError);
      return NextResponse.json({
        success: false,
        error: validationError,
      }, { status: 400 });
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
    } = body;

    // Verify the transaction on Solana (idempotent path supported)
    console.log('Verifying transaction:', signature);
    let verified: boolean;
    if (signature === 'already-processed') {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const info = await connection.getAccountInfo(new PublicKey(fundId));
        verified = info !== null;
        if (!verified) {
          return NextResponse.json({ success: false, error: 'Fund not found on-chain yet. Please retry shortly.' }, { status: 409 });
        }
      } catch (e) {
        console.error('Idempotent verification failed:', e);
        return NextResponse.json({ success: false, error: 'Failed to verify fund account' }, { status: 500 });
      }
    } else {
      verified = await verifyTransaction(signature);
    }
    console.log('Transaction verified:', verified);
    if (!verified) {
      console.log('Transaction verification failed');
      return NextResponse.json({ success: false, error: 'Invalid transaction signature' }, { status: 400 });
    }

    // Store fund in MongoDB
    console.log('Connecting to MongoDB...');
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Funds');

    // Check if fund already exists
    console.log('Checking for existing fund with ID:', fundId);
    const existingFund = await collection.findOne({ fundId });
    if (existingFund) {
      console.log('Fund already exists');
      return NextResponse.json({
        success: false,
        error: 'Fund already exists',
      }, { status: 409 });
    }

    console.log('Creating fund data...');
    const docId = signature === 'already-processed' ? fundId : signature;
    const fundData = {
      _id: docId, // Use tx signature normally; use fundId on idempotent path
      fundId,
      manager,
      name,
      description,
      fundType,
      performanceFee,
      maxCapacity,
      isPublic,
      signature,
      
      // Financial tracking
      totalDeposits: initialDeposit, // Total SOL deposited (TVL)
      totalShares: initialDeposit,   // Total shares issued
      currentValue: initialDeposit,  // Current vault value (will change with trading)
  // Track explicit SOL holdings for trader UI accounting (reduced by swaps / increased by deposits)
  solBalance: initialDeposit,    // Initialize SOL balance equal to initial deposit
      
      // Investment tracking
      investments: initialDeposit > 0 ? [{
        walletAddress: manager,
        amount: initialDeposit,
        shares: initialDeposit,
        timestamp: new Date(),
        transactionSignature: signature,
        type: 'initial_deposit'
      }] : [],
      
      // Metadata
      investorCount: initialDeposit > 0 ? 1 : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // Performance history (will track actual trading performance)
      performanceHistory: [{
        date: new Date().toISOString(),
        tvl: initialDeposit,
        nav: 1.0, // Net Asset Value per share (starts at 1.0)
        pnl: 0,   // Trading P&L (starts at 0)
        pnlPercentage: 0
      }],
      
      // Trading stats (for future use)
      stats: {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnL: 0,
        avgWinSol: 0,
        avgLossPct: 0,
        avgLossSol: 0,
        drawdownPct: 0,
        drawdownSol: 0,
        topWins: [],
        topLosses: []
      }
    };

    console.log('Inserting fund into database...');
    await collection.insertOne(fundData);
    console.log('Fund created successfully with id:', docId);

    return NextResponse.json({
      success: true,
      data: {
        id: docId,
        ...fundData
      },
    }, { status: 201 });

  } catch (error) {
    console.error('=== ERROR CREATING FUND ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create fund',
    }, { status: 500 });
  }
}
