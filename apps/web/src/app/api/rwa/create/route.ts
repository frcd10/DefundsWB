import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, PublicKey } from '@solana/web3.js';

function validateCreateRwaRequest(body: Record<string, any>) {
  const required = ['fundId', 'manager', 'name', 'signature'];
  for (const field of required) {
    if (!body[field]) return `Missing required field: ${field}`;
  }
  const accessMode = body.accessMode || 'public';
  if (!['public', 'single_code', 'multi_code'].includes(accessMode)) return 'Invalid accessMode';
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
      body.__generateInviteCodes = n;
      codes = [];
    }
    if (Array.isArray(codes) && codes.length > 2000) return 'Too many invite codes (max 2000)';
    if (Array.isArray(codes)) {
      for (const c of codes) {
        if (typeof c !== 'string' || !/^\d{6}$/.test(c)) return 'All inviteCodes must be 6 digit strings';
      }
    }
  }
  if (body.maxPerInvestor !== undefined && body.maxPerInvestor !== '') {
    const raw = String(body.maxPerInvestor).replace(/,/g, '.');
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return 'maxPerInvestor must be a positive number if provided';
    body.maxPerInvestor = v;
  }
  if (body.perInvestorInviteCodes !== undefined && body.perInvestorInviteCodes !== null && body.perInvestorInviteCodes !== '') {
    const n = Number(body.perInvestorInviteCodes);
    if (!Number.isInteger(n) || n < 0 || n > 5) return 'perInvestorInviteCodes must be an integer between 0 and 5';
    body.perInvestorInviteCodes = n;
  }
  return null;
}

async function verifyTransaction(signature: string): Promise<boolean> {
  try {
    if (signature.startsWith('mock_')) return false;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
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
      maxPerInvestor
    } = body;

    // Accept idempotent client path: if signature is a placeholder from an "already processed" tx,
    // confirm that the fund account now exists on-chain and proceed.
    let ok: boolean;
    if (signature === 'already-processed') {
      try {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');
        const info = await connection.getAccountInfo(new PublicKey(fundId));
        ok = info !== null;
        if (!ok) {
          return NextResponse.json({ success: false, error: 'Fund not found on-chain yet. Please retry in a few seconds.' }, { status: 409 });
        }
      } catch {
        return NextResponse.json({ success: false, error: 'Failed to verify fund account for idempotent creation' }, { status: 500 });
      }
    } else {
      ok = await verifyTransaction(signature);
    }
    if (!ok) return NextResponse.json({ success: false, error: 'Invalid transaction signature' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = db.collection('Rwa');

    const exists = await collection.findOne({ fundId });
    if (exists) return NextResponse.json({ success: false, error: 'Product already exists' }, { status: 409 });

    const now = new Date();
    const docId = signature === 'already-processed' ? fundId : signature;
    const doc = {
      _id: docId,
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
            body.inviteCodes = codes;
          }
          return { type: 'multi_code', codes: codes.map(c => ({ code: c, used: false })) };
        }
        return { type: 'public' };
      })(),
  maxPerInvestor: maxPerInvestor ? Number(maxPerInvestor) : undefined,
  perInvestorInviteCodes: (typeof body.perInvestorInviteCodes === 'number') ? body.perInvestorInviteCodes : 0,
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
  return NextResponse.json({ success: true, data: { id: docId, ...doc } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to create RWA product' }, { status: 500 });
  }
}
