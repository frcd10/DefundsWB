import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

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

    // Verify the transaction on Solana
    console.log('Verifying transaction:', signature);
    const verified = await verifyTransaction(signature);
    console.log('Transaction verified:', verified);
    
    if (!verified) {
      console.log('Transaction verification failed');
      return NextResponse.json({
        success: false,
        error: 'Invalid transaction signature',
      }, { status: 400 });
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
    const fundData = {
      _id: signature, // Use transaction signature as the MongoDB _id
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

    console.log('Inserting fund into database...');
    await collection.insertOne(fundData);
    console.log('Fund created successfully with signature as ID:', signature);

    return NextResponse.json({
      success: true,
      data: {
        id: signature, // Return the transaction signature as the ID
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
