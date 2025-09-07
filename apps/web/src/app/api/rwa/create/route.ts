import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

function validateCreateRwaRequest(body: Record<string, unknown>) {
  const required = ['fundId', 'manager', 'name', 'signature'];
  for (const field of required) {
    if (!body[field]) return `Missing required field: ${field}`;
  }
  return null;
}

async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    if (signature.startsWith('mock_')) return false;
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    return tx !== null;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const err = validateCreateRwaRequest(body);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

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
    } = body;

    const ok = await verifyTransaction(signature);
    if (!ok) return NextResponse.json({ success: false, error: 'Invalid transaction signature' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Rwa');

    const exists = await collection.findOne({ fundId });
    if (exists) return NextResponse.json({ success: false, error: 'Product already exists' }, { status: 409 });

    const now = new Date();
    const doc = {
      _id: signature,
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
      currentValue: initialDeposit,
      investments: initialDeposit > 0 ? [{
        walletAddress: manager,
        amount: initialDeposit,
        shares: initialDeposit,
        timestamp: now,
        transactionSignature: signature,
        type: 'initial_deposit',
      }] : [],
      investorCount: initialDeposit > 0 ? 1 : 0,
      createdAt: now,
      updatedAt: now,
      performanceHistory: [{ date: now.toISOString(), tvl: initialDeposit, nav: 1.0, pnl: 0, pnlPercentage: 0 }],
      stats: {
        total: 0, wins: 0, losses: 0, avgWinPct: 0, avgWinSol: 0, avgLossPct: 0, avgLossSol: 0, drawdownPct: 0, drawdownSol: 0,
        topWins: [], topLosses: []
      },
    };

    await collection.insertOne(doc as unknown as Record<string, unknown>);
    return NextResponse.json({ success: true, data: { id: signature, ...doc } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create RWA product' }, { status: 500 });
  }
}
