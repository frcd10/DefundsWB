import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Minimal swap endpoint: record-keeping + optional TX verification. Assumes trader signs client-side.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fundId, manager, fromMint, toMint, inAmountLamports, signature } = body as {
      fundId: string; manager: string; fromMint: string; toMint: string; inAmountLamports: number; signature?: string;
    };

    if (!fundId || !manager || !fromMint || !toMint || !inAmountLamports) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    // Verify manager controls the fund
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const fund = await db.collection('Funds').findOne({ fundId, manager });
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found or not owned by manager' }, { status: 404 });

    // Optionally verify swap tx on-chain if provided (devnet)
    if (signature) {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const conn = new Connection(rpcUrl, 'confirmed');
        const tx = await conn.getTransaction(signature, { commitment: 'confirmed' });
        if (!tx || tx.meta?.err) return NextResponse.json({ success: false, error: 'Invalid swap signature' }, { status: 400 });
      } catch {
        // Continue without hard failure for dev
      }
    }

    // Basic accounting: track positions map by mint and a solBalance field
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const fromIsSol = fromMint === SOL_MINT;
    const toIsSol = toMint === SOL_MINT;

    // Convert lamports amount to SOL for TVL adjustments when SOL is involved
    const inAmountSOL = inAmountLamports / LAMPORTS_PER_SOL;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const tradeRecord = { timestamp: new Date(), fromMint, toMint, inAmountLamports, signature: signature || null };

    // Initialize positions structure if absent
    const positions = fund.positions || {};
    const solBalance = fund.solBalance || 0;

    // Update local accounting
    let newSol = solBalance;
    if (fromIsSol) newSol -= inAmountSOL;
    if (toIsSol) newSol += 0; // outAmount unknown here; UI can pass expectedOut to refine later

    // Track token side: decrement fromMint amount, increment toMint amount (approx; precise via UI estimates)
    const pos = { ...(positions as Record<string, number>) };
    pos[fromMint] = (pos[fromMint] || 0) - inAmountLamports; // store in lamports-like units for tokens
    pos[toMint] = (pos[toMint] || 0) + 0; // will be updated by follow-up reconcile if needed

    updates['positions'] = pos;
    updates['solBalance'] = newSol < 0 ? 0 : newSol;

    await db.collection('Funds').updateOne(
      { fundId },
      { $set: updates, $push: { trades: tradeRecord } } as unknown as Record<string, unknown>
    );

    return NextResponse.json({ success: true, data: { fundId, positions: pos, solBalance: updates['solBalance'] } });
  } catch (e) {
    console.error('[trader/swap] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
