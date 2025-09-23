import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

type Investment = { walletAddress: string; shares: number };
type RwaDoc = { fundId: string; manager: string; totalShares?: number; investments?: Investment[]; performanceFee?: number };

// Execute real devnet SOL transfers proportionally, batching up to 20 recipients per transaction.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
  const { fundId, manager, addValue, payments } = body as {
      fundId: string;
      manager: string;
      addValue: number;
      payments?: Array<{ signature: string; totalValue: number; recipients: Array<{ wallet: string; amountSol: number }> }>;
    };
    if (!fundId || !manager || typeof addValue !== 'number' || addValue <= 0) {
      return NextResponse.json({ success: false, error: 'Missing or invalid fields' }, { status: 400 });
    }

    // Initialize connection
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const rwa = (await db.collection('Rwa').findOne({ fundId, manager })) as RwaDoc | null;
    if (!rwa) return NextResponse.json({ success: false, error: 'RWA not found or not owned by manager' }, { status: 404 });

    const investments: Investment[] = rwa.investments || [];
    const effectiveTotalShares: number = investments.reduce((s, i) => s + Math.max(0, i.shares || 0), 0);
    if (effectiveTotalShares <= 0 || investments.length === 0) {
      return NextResponse.json({ success: false, error: 'No investors to pay' }, { status: 400 });
    }

  // If client already executed and is posting signatures, just record them after a light confirmation check
    if (Array.isArray(payments) && payments.length > 0) {
      const now = new Date();
      // Verify signatures exist on-chain (confirmed)
      for (const p of payments) {
        const tx = await connection.getTransaction(p.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx) return NextResponse.json({ success: false, error: `Signature not found: ${p.signature}` }, { status: 400 });
      }

      // Recompute fees for audit trail
      const perfFeePct = Math.max(0, Math.min(100, Number(rwa.performanceFee ?? 0)));
      const platformFee = addValue * 0.01;
      const afterPlatform = Math.max(0, addValue - platformFee);
      const performanceFee = afterPlatform * (perfFeePct / 100);
      const treasuryPerformanceShare = performanceFee * 0.20;
      const managerPerformanceShare = performanceFee - treasuryPerformanceShare;
      const treasuryAmount = platformFee + treasuryPerformanceShare;
      const investorsPool = Math.max(0, afterPlatform - performanceFee);

      await db.collection('Rwa').updateOne(
        { fundId },
        {
          $inc: { currentValue: -addValue },
          $set: { updatedAt: now },
          $push: {
            payments: {
              $each: payments.map((p) => ({
                timestamp: now,
                totalValue: p.totalValue,
                signature: p.signature,
                recipients: p.recipients,
                feeBreakdown: { addValue, platformFee, afterPlatform, performanceFee, investorsPool, treasuryPerformanceShare, managerPerformanceShare, treasuryAmount, perfFeePct },
              })),
            },
          },
        } as unknown as Record<string, unknown>
      );

      return NextResponse.json({ success: true, data: { payments: payments.map((p) => ({ ...p, timestamp: now })) } });
    }

    // ───────────────────────────────────────────────────────────────
    // Fees & distributions
    // 1) Platform fee: 1% of total payout goes to treasury
    // 2) Performance fee: % of remaining after platform fee; treasury receives 20% of that fee
    // Investors receive the rest; manager keeps 80% of performance fee (no transfer needed)
    // ───────────────────────────────────────────────────────────────
    const treasuryWallet = process.env.TREASURY_WALLET || process.env.NEXT_PUBLIC_TREASURY_WALLET || '8NCLTHTiHJsgDoKyydY8vQfyi8RPDU4P59pCUHQGrBFm';
    const perfFeePct = Math.max(0, Math.min(100, Number(rwa.performanceFee ?? 0))); // percent (not bps)

  const platformFee = addValue * 0.01; // 1%
  const afterPlatform = Math.max(0, addValue - platformFee);
  const performanceFee = afterPlatform * (perfFeePct / 100);
  const treasuryPerformanceShare = performanceFee * 0.20; // 20% of performance fee to treasury
  const managerPerformanceShare = performanceFee - treasuryPerformanceShare; // 80%
  const treasuryAmount = platformFee + treasuryPerformanceShare;
  const investorsPool = Math.max(0, afterPlatform - performanceFee);

    // Proportional distribution to investors from investorsPool
    const investorTransfers = investments
      .map((inv) => {
        const shares = Math.max(0, inv.shares || 0);
        const amountSol = effectiveTotalShares > 0 ? (investorsPool * shares) / effectiveTotalShares : 0;
        return { wallet: inv.walletAddress, amountSol };
      })
      .filter((t) => t.amountSol > 0);

    // Add treasury recipient (platform 1% + 20% of performance fee)
    const planned = [
      ...investorTransfers,
      // Manager receives 80% of performance fee explicitly for full-audit trail
      ...(managerPerformanceShare > 0 ? [{ wallet: manager, amountSol: managerPerformanceShare }] : []),
      { wallet: treasuryWallet, amountSol: treasuryAmount },
    ];

    // Return the plan to be signed client-side with fee breakdown for transparency
  return NextResponse.json({ success: true, data: { plan: planned, fees: { addValue, platformFee, afterPlatform, performanceFee, investorsPool, treasuryPerformanceShare, managerPerformanceShare, treasuryAmount, perfFeePct, treasuryWallet } } });
  } catch (e) {
    console.error('rwa/pay error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
