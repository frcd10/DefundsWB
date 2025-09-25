import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

function validate(body: Record<string, unknown>) {
  const reqd = ['fundId', 'investorWallet', 'amount', 'signature'];
  for (const f of reqd) if (!body[f]) return `Missing required field: ${f}`;
  const amt = Number(body.amount);
  if (!Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number';
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
      investments?: Array<{ walletAddress: string }>;
    }>({ fundId } as any);
    if (!product) return NextResponse.json({ success: false, error: 'RWA product not found' }, { status: 404 });

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

    await col.updateOne(
      { fundId },
      {
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
        } as any,
      } as any
    );

    return NextResponse.json({ success: true, data: { fundId, amount, signature } }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to invest in RWA product' }, { status: 500 });
  }
}
