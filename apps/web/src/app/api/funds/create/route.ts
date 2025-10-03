import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, PublicKey } from '@solana/web3.js';

// Validation function
function validateCreateFundRequest(body: Record<string, any>) {
  const required = ['fundId', 'manager', 'name', 'signature'];
  for (const field of required) {
    if (!body[field]) {
      return `Missing required field: ${field}`;
    }
  }

  // Access control validation
  const accessMode = body.accessMode || 'public';
  if (!['public', 'single_code', 'multi_code'].includes(accessMode)) {
    return 'Invalid accessMode';
  }

  if (accessMode === 'single_code') {
    const code = body.inviteCode;
    if (!code) return 'inviteCode required for single_code accessMode';
    if (typeof code !== 'string') return 'inviteCode must be a string';
    if (!/^[a-zA-Z0-9]{1,10}$/.test(code)) return 'inviteCode must be 1-10 alphanumeric chars';
  } else if (accessMode === 'multi_code') {
    let codes = body.inviteCodes;
    const countRaw = body.inviteCodesCount;
    if ((!Array.isArray(codes) || codes.length === 0) && (countRaw === undefined || countRaw === null)) {
      return 'Provide inviteCodes array or inviteCodesCount for multi_code accessMode';
    }
    if ((!Array.isArray(codes) || codes.length === 0) && countRaw) {
      const n = Number(countRaw);
      if (!Number.isInteger(n) || n < 1 || n > 2000) return 'inviteCodesCount must be integer 1-2000';
      // generate placeholder; real generation done below before insert
      body.__generateInviteCodes = n; // flag for later
      codes = [];
    }
    if (Array.isArray(codes) && codes.length > 2000) return 'Too many invite codes (max 2000)';
    if (Array.isArray(codes)) {
      for (const c of codes) {
        if (typeof c !== 'string' || !/^\d{6}$/.test(c)) {
          return 'All inviteCodes must be 6 digit strings';
        }
      }
    }
  }
  if (body.maxPerInvestor !== undefined && body.maxPerInvestor !== '') {
    const raw = String(body.maxPerInvestor).replace(/,/g, '.');
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return 'maxPerInvestor must be a positive number if provided';
    body.maxPerInvestor = v; // normalize
  }
  // Per-investor invite codes (0-5)
  if (body.perInvestorInviteCodes !== undefined && body.perInvestorInviteCodes !== null && body.perInvestorInviteCodes !== '') {
    const n = Number(body.perInvestorInviteCodes);
    if (!Number.isInteger(n) || n < 0 || n > 5) return 'perInvestorInviteCodes must be an integer between 0 and 5';
    body.perInvestorInviteCodes = n;
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
      initialDeposit = 0,
      maxPerInvestor
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
      accessMode: body.accessMode || 'public',
      access: (() => {
        if ((body.accessMode || 'public') === 'single_code') {
          return { type: 'single_code', code: String(body.inviteCode).toUpperCase() };
        }
        if ((body.accessMode || 'public') === 'multi_code') {
          let codes: string[] = body.inviteCodes || [];
          if (body.__generateInviteCodes && codes.length === 0) {
            const n: number = body.__generateInviteCodes;
            const set = new Set<string>();
            while (set.size < n) {
              set.add(Math.floor(100000 + Math.random() * 900000).toString());
            }
            codes = Array.from(set);
            body.inviteCodes = codes; // expose in response
          }
          return { type: 'multi_code', codes: codes.map((c: string) => ({ code: c, used: false })) };
        }
        return { type: 'public' };
      })(),
      maxPerInvestor: maxPerInvestor ? Number(maxPerInvestor) : undefined,
  perInvestorInviteCodes: (typeof body.perInvestorInviteCodes === 'number') ? body.perInvestorInviteCodes : 0,
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
