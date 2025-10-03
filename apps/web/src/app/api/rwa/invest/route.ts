import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

function validate(body: Record<string, any>) {
  const reqd = ['fundId', 'investorWallet', 'amount', 'signature'];
  for (const f of reqd) if (!body[f]) return `Missing required field: ${f}`;
  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number';
  if (body.inviteCode && typeof body.inviteCode !== 'string') return 'inviteCode must be a string';
  return null;
}

async function verify(signature: string): Promise<boolean> {
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
    const err = validate(body);
    if (err) return NextResponse.json({ success: false, error: err }, { status: 400 });

  const { fundId, investorWallet, amount, signature } = body as { fundId: string; investorWallet: string; amount: number; signature: string };
  const generateInviteCodesCountRaw = (body as any).generateInviteCodesCount;
  let inviteCode: string | undefined = body.inviteCode ? String(body.inviteCode).trim() : undefined;
  if (inviteCode) inviteCode = inviteCode.toUpperCase();

    const ok = await verify(signature);
    if (!ok) return NextResponse.json({ success: false, error: 'Invalid transaction signature' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection('Rwa');

    // Idempotency: if signature already recorded, return success
    const dup = await col.findOne({ fundId, 'investments.transactionSignature': signature } as any);
    if (dup) return NextResponse.json({ success: true, data: { fundId, amount, signature, idempotent: true } }, { status: 200 });

    const product = await col.findOne<{
      totalDeposits?: number;
      totalShares?: number;
      currentValue?: number;
      investorCount?: number;
      investments?: Array<{ walletAddress: string; amount?: number }>;
      accessMode?: string;
      access?: any;
      maxPerInvestor?: number;
    }>({ fundId } as any);
    if (!product) return NextResponse.json({ success: false, error: 'RWA product not found' }, { status: 404 });

    // Access control checks
  const mode: 'public' | 'single_code' | 'multi_code' = (product as any).accessMode || (product as any).access?.type || 'public';
    if (mode === 'single_code') {
      const expected = product.access?.code?.toUpperCase();
      if (!inviteCode) return NextResponse.json({ success: false, error: 'Invite code required' }, { status: 400 });
      if (inviteCode !== expected) return NextResponse.json({ success: false, error: 'Invalid invite code' }, { status: 403 });
    } else if (mode === 'multi_code') {
      if (!inviteCode) return NextResponse.json({ success: false, error: 'Invite code required' }, { status: 400 });
      // Find unused code
      const codeEntry = (product.access?.codes || []).find((c: any) => c.code === inviteCode);
      if (!codeEntry) return NextResponse.json({ success: false, error: 'Invalid invite code' }, { status: 403 });
      if (codeEntry.used) return NextResponse.json({ success: false, error: 'Invite code already used' }, { status: 403 });
    }

    // Per-investor cap enforcement
    if (product.maxPerInvestor) {
      const priorInvestments = (product.investments || []).filter(i => i.walletAddress === investorWallet);
      const priorTotal = priorInvestments.reduce((sum, i: any) => sum + (i.amount || 0), 0);
      if (priorTotal + amount > product.maxPerInvestor + 1e-9) {
        return NextResponse.json({ success: false, error: 'Investment exceeds per-investor limit' }, { status: 400 });
      }
    }

    const currentNav = product.currentValue && product.totalShares && product.totalShares > 0
      ? product.currentValue / product.totalShares
      : 1.0;
  const sharesToIssue = Math.max(0, amount / currentNav);

    const newTotals = {
      totalDeposits: (product.totalDeposits ?? 0) + amount,
      totalShares: (product.totalShares ?? 0) + sharesToIssue,
      currentValue: (product.currentValue ?? 0) + amount,
    };

    const isExistingInvestor = (product.investments ?? []).some((inv) => inv.walletAddress === investorWallet);
    const newInvestorCount = isExistingInvestor ? (product.investorCount ?? 0) : ((product.investorCount ?? 0) + 1);

    const update: any = {
      $set: {
        ...newTotals,
        investorCount: newInvestorCount,
        updatedAt: new Date(),
      },
      $push: {
        investments: {
          walletAddress: investorWallet,
          amount,
          shares: sharesToIssue,
          navAtTime: currentNav,
          timestamp: new Date(),
          transactionSignature: signature,
          type: 'investment',
        },
        performanceHistory: {
          date: new Date().toISOString(),
          tvl: newTotals.totalDeposits,
          nav: newTotals.totalShares > 0 ? newTotals.currentValue / newTotals.totalShares : 1.0,
          pnl: newTotals.currentValue - newTotals.totalDeposits,
          pnlPercentage: newTotals.totalDeposits > 0 ? ((newTotals.currentValue - newTotals.totalDeposits) / newTotals.totalDeposits) * 100 : 0,
        },
      }
    };
    if (mode === 'multi_code' && inviteCode) {
      update.$set['access.codes.$[codeEl].used'] = true;
    }
    // Generate per-investor invite codes if configured
    let newCodes: string[] = [];
    const perInvestorCount: number = (product as any).perInvestorInviteCodes || 0;
    const requestedCount = Number(generateInviteCodesCountRaw);
    const finalCount = Number.isInteger(requestedCount) ? Math.max(0, Math.min(perInvestorCount, requestedCount)) : perInvestorCount;
    if (mode === 'multi_code' && finalCount > 0) {
      const set = new Set<string>();
      const existingCodes = new Set<string>(((product as any).access?.codes || []).map((c: any) => c.code));
      while (set.size < finalCount) {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        if (!existingCodes.has(code)) set.add(code);
      }
      newCodes = Array.from(set);
      if (!update.$push.access) update.$push.access = {} as any;
      update.$push['access.codes'] = { $each: newCodes.map(c => ({ code: c, used: false })) } as any;
    }

    await col.updateOne(
      { fundId },
      update,
      mode === 'multi_code' && inviteCode ? { arrayFilters: [{ 'codeEl.code': inviteCode }] } as any : undefined
    );

  return NextResponse.json({ success: true, data: { fundId, amount, signature, inviteCodes: newCodes } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to invest in RWA product' }, { status: 500 });
  }
}
