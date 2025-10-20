import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';

// Program ID from env
const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID || process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || '11111111111111111111111111111111');

export async function GET(_req: Request, context: { params: Promise<{ fundId: string }> }) {
  try {
    const { fundId } = await context.params;
    const safeFundId = (fundId || '').trim();
    if (!safeFundId) return NextResponse.json({ success: false, error: 'fundId required' }, { status: 400 });

    const connection = new Connection(
      (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim(),
      'confirmed'
    );

  const fundPk = new PublicKey(safeFundId);
    const [sharesMintPk] = PublicKey.findProgramAddressSync([
      Buffer.from('shares'),
      fundPk.toBuffer(),
    ], PROGRAM_ID);

    // Read mint to get decimals and total supply
    const mintAcc = await connection.getParsedAccountInfo(sharesMintPk, 'confirmed');
    let totalSharesUi = 0;
    let decimals = 0;
    const parsed: any = mintAcc?.value?.data;
    if (parsed?.program === 'spl-token') {
      const info = parsed.parsed?.info || {};
      const supplyStr: string = info?.supply ?? '0';
      decimals = Number(info?.decimals ?? 0) || 0;
      const supply = Number(supplyStr);
      if (Number.isFinite(supply)) totalSharesUi = supply / Math.pow(10, decimals);
    }

    // Fetch all investor positions for this fund with a single programAccounts query
    // InvestorPosition layout: 8(discriminator) + 32(investor) + 32(fund) + 8(shares) + ...
    const FUND_OFFSET = 8 + 32; // position of fund pubkey within account data
    const SHARES_OFFSET = 8 + 32 + 32; // position of shares u64 within account data

    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: FUND_OFFSET, bytes: fundPk.toBase58() } },
      ],
      commitment: 'confirmed',
    });

    const readU64LE = (buf: Buffer, offset: number): bigint => {
      return (buf.readBigUInt64LE as any)?.call(buf, offset) ?? BigInt(0);
    };

    const investors: Array<{ wallet: string; sharesUi: number; ownershipPct: number }> = [];
    for (const acc of accounts) {
      const data = acc.account.data as Buffer;
      if (!data || data.length < SHARES_OFFSET + 8) continue;
      const investorPk = new PublicKey(data.subarray(8, 8 + 32));
      const sharesRaw = readU64LE(data, SHARES_OFFSET);
      const sharesUi = Number(sharesRaw) / Math.pow(10, decimals);
      const ownershipPct = totalSharesUi > 0 ? Math.min(100, Math.max(0, (sharesUi / totalSharesUi) * 100)) : 0;
      investors.push({ wallet: investorPk.toBase58(), sharesUi, ownershipPct });
    }

    // Deduplicate by wallet (keep max shares)
    const dedup = new Map<string, { wallet: string; sharesUi: number; ownershipPct: number }>();
    for (const inv of investors) {
      const prev = dedup.get(inv.wallet);
      if (!prev || inv.sharesUi > prev.sharesUi) dedup.set(inv.wallet, inv);
    }

    return NextResponse.json({
      success: true,
      data: {
  fundId: safeFundId,
        sharesMint: sharesMintPk.toBase58(),
        decimals,
        totalSharesUi,
        investors: Array.from(dedup.values()),
      }
    });
  } catch (e) {
    console.error('[funds/ownership] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
