import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

type Investment = { walletAddress: string; shares: number };
type RwaDoc = { fundId: string; manager: string; totalShares?: number; investments?: Investment[] };

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
  const totalShares: number = rwa.totalShares || investments.reduce((s, i) => s + (i.shares || 0), 0);
    if (totalShares <= 0 || investments.length === 0) {
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

      await db.collection('Rwa').updateOne(
        { fundId },
        {
          $inc: { currentValue: -addValue },
          $set: { updatedAt: now },
          $push: {
            payments: {
              $each: payments.map((p) => ({ timestamp: now, totalValue: p.totalValue, signature: p.signature, recipients: p.recipients })),
            },
          },
        } as unknown as Record<string, unknown>
      );

      return NextResponse.json({ success: true, data: { payments } });
    }

  // Proportional distribution amounts in SOL; returned for client-side wallet signing
    const planned = investments
      .map((inv) => ({ wallet: inv.walletAddress, amountSol: (addValue * (inv.shares || 0)) / totalShares }))
      .filter((t) => t.amountSol > 0);
  // Just return the plan to be signed client-side
  return NextResponse.json({ success: true, data: { plan: planned } });
  } catch (e) {
    console.error('rwa/pay error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
