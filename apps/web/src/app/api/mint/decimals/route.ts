import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mint = url.searchParams.get('mint');
    if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 });
    const endpoint = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(endpoint, { commitment: 'processed' });
    const info = await connection.getParsedAccountInfo(new PublicKey(mint));
    const parsed: any = info.value?.data;
    const decimals = parsed?.parsed?.info?.decimals;
    if (typeof decimals !== 'number') return NextResponse.json({ error: 'not a mint' }, { status: 400 });
    return NextResponse.json({ mint, decimals });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
