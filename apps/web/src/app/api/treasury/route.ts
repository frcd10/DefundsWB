import { NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';

export async function GET() {
  try {
    const address = process.env.TREASURY_WALLET || null;
    if (!address) {
      return NextResponse.json({ success: true, data: { address: null, lamports: 0, sol: 0, expectedDistributionLamports: 0, expectedDistributionSol: 0 } });
    }
    let pk: PublicKey;
    try {
      pk = new PublicKey(address);
    } catch {
      return NextResponse.json({ success: true, data: { address, lamports: 0, sol: 0, expectedDistributionLamports: 0, expectedDistributionSol: 0 } });
    }
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const lamports = await connection.getBalance(pk);
    const sol = lamports / LAMPORTS_PER_SOL;
    const expectedDistributionLamports = Math.floor(lamports * 0.8);
    const expectedDistributionSol = sol * 0.8;
    return NextResponse.json({ success: true, data: { address, lamports, sol, expectedDistributionLamports, expectedDistributionSol } });
  } catch (e) {
    console.error('[treasury] GET error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
