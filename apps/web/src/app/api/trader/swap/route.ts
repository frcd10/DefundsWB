import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

// MOCK SWAP ENDPOINT (dev / non-mainnet)
// When NOT on mainnet-beta this just performs off-chain accounting with optional signature presence.
// Future: On mainnet-beta integrate real DEX (Jupiter / SPL Token Swap) and require a verified signature & amounts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fundId, manager, fromMint, toMint, inAmountLamports, outAmountLamports, signature, routeMeta } = body as {
      fundId: string; manager: string; fromMint: string; toMint: string; inAmountLamports: number; outAmountLamports?: number; signature?: string; routeMeta?: unknown;
    };

  if (!fundId || !manager || !fromMint || !toMint || !inAmountLamports) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    // Verify manager controls the fund
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const fund = await db.collection('Funds').findOne({ fundId, manager });
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found or not owned by manager' }, { status: 404 });

    const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
    const isMainnet = cluster === 'mainnet-beta';
    if (isMainnet && signature) {
      try {
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const conn = new Connection(rpcUrl, 'confirmed');
        const tx = await conn.getTransaction(signature, { commitment: 'confirmed' });
        if (!tx || tx.meta?.err) return NextResponse.json({ success: false, error: 'Invalid swap signature' }, { status: 400 });
      } catch {
        return NextResponse.json({ success: false, error: 'Failed to verify mainnet swap signature' }, { status: 400 });
      }
    }

    // Basic accounting: track positions map by mint and a solBalance field
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const fromIsSol = fromMint === SOL_MINT;
    const toIsSol = toMint === SOL_MINT;

    // Convert lamports amount to SOL for TVL adjustments when SOL is involved
    const inAmountSOL = inAmountLamports / LAMPORTS_PER_SOL;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const tradeRecord = { timestamp: new Date(), fromMint, toMint, inAmountLamports, outAmountLamports: outAmountLamports || null, signature: signature || null, routeMeta: routeMeta || null };

    // Initialize positions structure if absent
    const positions = fund.positions || {};
    const solBalance = fund.solBalance || 0;

    // Update local accounting
    let newSol = solBalance;
  if (fromIsSol) newSol -= inAmountSOL;
  if (toIsSol && outAmountLamports) newSol += (outAmountLamports / LAMPORTS_PER_SOL);

    // Track token side: decrement fromMint amount, increment toMint amount (approx; precise via UI estimates)
    const pos = { ...(positions as Record<string, number>) };
    pos[fromMint] = (pos[fromMint] || 0) - inAmountLamports; // subtract input
    if (outAmountLamports && outAmountLamports > 0) {
      pos[toMint] = (pos[toMint] || 0) + outAmountLamports; // add received (already in that token's native units)
    } else if (pos[toMint] === undefined) {
      pos[toMint] = 0; // ensure key exists
    }

    // Clamp negatives to zero and drop dust (< 1 unit depending on SOL vs token decimals not known here)
    for (const k of Object.keys(pos)) {
      if (pos[k] < 0) pos[k] = 0;
      if (Math.abs(pos[k]) < 1) {
        // leave small integer units so UI can still reflect movement; adjust rule if needed
        if (pos[k] === 0) delete pos[k];
      }
    }

    updates['positions'] = pos;
  updates['solBalance'] = newSol < 0 ? 0 : newSol;

    await db.collection('Funds').updateOne(
      { fundId },
      { $set: updates, $push: { trades: tradeRecord } } as unknown as Record<string, unknown>
    );

  return NextResponse.json({ success: true, data: { fundId, positions: pos, solBalance: updates['solBalance'], mock: !isMainnet } });
  } catch (e) {
    console.error('[trader/swap] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
