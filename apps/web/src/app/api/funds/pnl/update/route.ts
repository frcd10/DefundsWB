import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function POST(req: NextRequest) {
  try {
  const body = await req.json().catch(() => ({}));
  const fundIdFilter = (body?.fundId as string | undefined)?.trim();

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const fundsCol = db.collection('Funds');
    const invWithdrawCol = db.collection('invWithdraw');

    const query: any = { cluster: { $ne: 'devnet' } };
    if (fundIdFilter) {
      query.$or = [{ fundId: fundIdFilter }, { _id: fundIdFilter }];
    }

    // Pull minimal fields, but include pnl array for cumulative computation
    const funds = await fundsCol
      .find(query, { projection: { pnl: 1, fundId: 1, _id: 1, totalDeposits: 1, investments: 1, manager: 1 } })
      .toArray();

    const rpcUrl = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(rpcUrl, 'confirmed');
    const PROGRAM_ID = new PublicKey('DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd');

    async function fetchPrices(mints: string[]): Promise<Record<string, { priceBaseUnits: string; updatedAt: number }>> {
      if (!mints.length) return {};
      try {
        const qs = mints.map(m => `mints=${encodeURIComponent(m)}`).join('&');
        const resp = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/prices?${qs}`, { cache: 'no-store' });
        const data = await resp.json();
        const out: Record<string, { priceBaseUnits: string; updatedAt: number }> = {};
        if (resp.ok && Array.isArray(data?.items)) {
          for (const it of data.items) {
            out[it.mint] = { priceBaseUnits: String(it.priceBaseUnits || '0'), updatedAt: Number(it.updatedAt || 0) };
          }
        }
        return out;
      } catch {
        return {};
      }
    }

    async function computeAumSolFromChain(fundPkStr: string): Promise<number> {
      try {
        const fundPk = new PublicKey(fundPkStr);
        const [vaultPk] = PublicKey.findProgramAddressSync([
          Buffer.from('vault'),
          fundPk.toBuffer(),
        ], PROGRAM_ID);
        const [vaultSolPk] = PublicKey.findProgramAddressSync([
          Buffer.from('vault_sol'),
          fundPk.toBuffer(),
        ], PROGRAM_ID);

        const [fundLamports, vaultLamports] = await Promise.all([
          connection.getBalance(fundPk, { commitment: 'processed' } as any).catch(() => 0),
          connection.getBalance(vaultPk, { commitment: 'processed' } as any).catch(() => 0),
        ]);
        let aumSol = (fundLamports + vaultLamports) / 1_000_000_000;
        try {
          const vaultSolInfo = await connection.getAccountInfo(vaultSolPk, 'processed');
          if (vaultSolInfo) aumSol += (vaultSolInfo.lamports || 0) / 1_000_000_000;
        } catch {}

        const tokenAccounts = await connection
          .getParsedTokenAccountsByOwner(vaultPk, { programId: TOKEN_PROGRAM_ID as any })
          .catch(() => ({ value: [] as any[] } as any));
        const rows: Array<{ mint: string; uiAmount: number }> = [];
        for (const { account } of (tokenAccounts?.value || [])) {
          const anyData: any = account?.data;
          if (!anyData || anyData.program !== 'spl-token') continue;
          const info = (anyData.parsed?.info || {}) as any;
          const mint: string = info.mint;
          const amountRaw: string = info.tokenAmount?.amount ?? '0';
          const uiAmount: number = Number(info.tokenAmount?.uiAmount ?? 0);
          if (amountRaw === '0') continue;
          rows.push({ mint, uiAmount });
        }
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const mints = Array.from(new Set(rows.map(r => r.mint).concat([SOL_MINT])));
        const prices = await fetchPrices(mints);
        const solPriceUsd = Number(prices[SOL_MINT]?.priceBaseUnits || '0') / 1_000_000 || 0;
        const solUsd = solPriceUsd > 0 ? solPriceUsd : 1;
        for (const r of rows) {
          if (r.mint === SOL_MINT) { aumSol += r.uiAmount; continue; }
          const p = prices[r.mint];
          if (!p) continue;
          const tokenUsd = (Number(p.priceBaseUnits || '0') / 1_000_000) * r.uiAmount;
          aumSol += tokenUsd / solUsd;
        }
        return aumSol;
      } catch {
        return 0;
      }
    }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  const updates: Array<{ fundId: string; index: number; seeded?: boolean }> = [];

    for (const fund of funds) {
      const fundId = String((fund as any).fundId || fund._id);
      const aumSol = await computeAumSolFromChain(fundId);

      // Compute invested and withdrawn
      let invested = Number((fund as any).totalDeposits || 0);
      if (!invested && Array.isArray((fund as any).investments)) {
        invested = (fund as any).investments.reduce((s: number, inv: any) => s + Math.max(0, Number(inv.amount || 0)), 0);
      }
      const invDoc = await invWithdrawCol.findOne({ _id: (fund as any).manager } as any).catch(() => null) as any;
      const wEntries = Array.isArray(invDoc?.funds?.[fundId]) ? invDoc.funds[fundId] : [];
      const withdrawn = wEntries.reduce((s: number, e: any) => s + Number(e?.amountSol || 0), 0);

  // Overall P&L percentage (fraction), cumulative from baseline
  const pnlSol = aumSol + withdrawn - invested;
  const pnlPct = invested > 0 ? (pnlSol / invested) : 0;

      // Determine previous cumulative index from latest pnl entry (default 1)
      const pnlArr: Array<{ date: Date | string; index: number }> = Array.isArray((fund as any).pnl) ? (fund as any).pnl : [];
      const lastEntry = pnlArr
        .slice()
        .sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime())
        .filter((e) => new Date(e.date as any).getTime() <= today.getTime())
        .pop();
      const lastIndex = Number(lastEntry?.index ?? 1);

      // Idempotency: if there is already an entry for today, skip unless seeding
      const hasToday = pnlArr.some((e) => {
        const d = new Date(e.date as any);
        return d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
      });

  // Cumulative index for today should reflect total return from baseline
  // i.e., index_today = 1 + cumulative_pct_today
  const todayCumIndex = 1 + pnlPct;

      const idCond = (() => { try { return new ObjectId(fundId); } catch { return null; } })();

      // Regular daily append: only push if not already recorded for today
      if (!hasToday) {
        await (fundsCol as any).updateOne(
          { $or: [{ fundId }, ...(idCond ? [{ _id: idCond }] as any[] : [])] },
          { $push: { pnl: { date: today, index: todayCumIndex } }, $set: { updatedAt: new Date() } },
        );
        updates.push({ fundId, index: todayCumIndex });
      }
    }

  return NextResponse.json({ success: true, items: updates });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'update failed' }, { status: 500 });
  }
}
