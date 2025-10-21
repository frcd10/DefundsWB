import dotenv from 'dotenv';
dotenv.config();

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import getClientPromise from '../lib/mongodb';

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

type PriceRow = { priceBaseUnits: string; updatedAt: number };

async function fetchPrices(baseUrl: string, mints: string[]): Promise<Record<string, PriceRow>> {
  if (!mints.length) return {};
  try {
    const qs = mints.map((m) => `mints=${encodeURIComponent(m)}`).join('&');
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/prices?${qs}`);
    const data: any = await resp.json().catch(() => ({}));
    const out: Record<string, PriceRow> = {};
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

async function computeAumSolFromChain(connection: Connection, programId: PublicKey, fundPkStr: string, pricesBase: string): Promise<number> {
  try {
    const fundPk = new PublicKey(fundPkStr);
    const [vaultPk] = PublicKey.findProgramAddressSync([Buffer.from('vault'), fundPk.toBuffer()], programId);
    const [vaultSolPk] = PublicKey.findProgramAddressSync([Buffer.from('vault_sol'), fundPk.toBuffer()], programId);

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
    for (const { account } of tokenAccounts.value || []) {
      const anyData: any = account?.data;
      if (!anyData || anyData.program !== 'spl-token') continue;
      const info = (anyData.parsed?.info || {}) as any;
      const mint: string = info.mint;
      const amountRaw: string = info.tokenAmount?.amount ?? '0';
      const uiAmount: number = Number(info.tokenAmount?.uiAmount ?? 0);
      if (amountRaw === '0') continue;
      rows.push({ mint, uiAmount });
    }

    if (rows.length) {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const mints = Array.from(new Set(rows.map((r) => r.mint).concat([SOL_MINT])));
      const prices = await fetchPrices(pricesBase, mints);
      const solPriceUsd = Number(prices[SOL_MINT]?.priceBaseUnits || '0') / 1_000_000 || 0;
      const solUsd = solPriceUsd > 0 ? solPriceUsd : 1;
      for (const r of rows) {
        if (r.mint === SOL_MINT) {
          aumSol += r.uiAmount;
          continue;
        }
        const p = prices[r.mint];
        if (!p) continue;
        const tokenUsd = (Number(p.priceBaseUnits || '0') / 1_000_000) * r.uiAmount;
        aumSol += tokenUsd / solUsd;
      }
    }

    return aumSol;
  } catch {
    return 0;
  }
}

async function main() {
  const FUND_ID = process.env.FUND_ID || process.argv[2];
  if (!FUND_ID) throw new Error('Provide FUND_ID env or as argv[2]');

  const client = await getClientPromise();
  const db = client.db('Defunds');
  const fundsCol = db.collection<any>('Funds');
  const invWithdrawCol = db.collection<any>('invWithdraw');

  const rpcUrl = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
  const connection = new Connection(rpcUrl, 'confirmed');
  const PROGRAM_ID = new PublicKey(process.env.MANAGED_FUNDS_PROGRAM_ID || 'DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd');
  const pricesBase = process.env.PRICES_BASE_URL || process.env.WEB_BASE_URL || '';

  const fund = await fundsCol.findOne({ $or: [{ fundId: FUND_ID }, { _id: FUND_ID }] }, { projection: { pnl: 1, totalDeposits: 1, investments: 1, manager: 1 } as any });
  if (!fund) throw new Error('Fund not found');

  const today = startOfUtcDay(new Date());
  const yesterday = startOfUtcDay(new Date(today.getTime() - 24 * 3600 * 1000));

  const aumSol = await computeAumSolFromChain(connection, PROGRAM_ID, FUND_ID, pricesBase);
  let invested = Number((fund as any).totalDeposits || 0);
  if (!invested && Array.isArray((fund as any).investments)) {
    invested = (fund as any).investments.reduce((s: number, inv: any) => s + Math.max(0, Number(inv.amount || 0)), 0);
  }
  const invDoc = await invWithdrawCol.findOne({ _id: (fund as any).manager } as any).catch(() => null) as any;
  const wEntries = Array.isArray(invDoc?.funds?.[FUND_ID]) ? invDoc.funds[FUND_ID] : [];
  const withdrawn = wEntries.reduce((s: number, e: any) => s + Number(e?.amountSol || 0), 0);
  const pnlSol = aumSol + withdrawn - invested;
  const pnlPct = invested > 0 ? pnlSol / invested : 0;

  const pnlArr: Array<{ date: Date | string; index: number }> = Array.isArray((fund as any).pnl) ? (fund as any).pnl : [];
  const sorted = pnlArr.slice().sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime());
  const last = sorted.filter((e) => new Date(e.date as any).getTime() <= today.getTime()).pop();
  const lastIndex = Number(last?.index ?? 1);
  const indexToday = (last ? lastIndex : 1) * (1 + pnlPct);

  const hasYesterday = pnlArr.some((e) => {
    const d = new Date(e.date as any);
    return d.getUTCFullYear() === yesterday.getUTCFullYear() && d.getUTCMonth() === yesterday.getUTCMonth() && d.getUTCDate() === yesterday.getUTCDate();
  });
  const hasToday = pnlArr.some((e) => {
    const d = new Date(e.date as any);
    return d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
  });

  if (!hasYesterday) {
    await (fundsCol as any).updateOne({ $or: [{ fundId: FUND_ID }, { _id: FUND_ID }] }, { $push: { pnl: { date: yesterday, index: 1 } }, $set: { updatedAt: new Date() } });
  }
  if (!hasToday) {
    await (fundsCol as any).updateOne({ $or: [{ fundId: FUND_ID }, { _id: FUND_ID }] }, { $push: { pnl: { date: today, index: indexToday } }, $set: { updatedAt: new Date() } });
  }

  console.log(`[pnl:seed] Seeded ${FUND_ID} with yesterday=1 and today=${indexToday.toFixed(6)}`);
}

main().catch((e) => {
  console.error('[pnl:seed] Failed', e);
  process.exit(1);
});
