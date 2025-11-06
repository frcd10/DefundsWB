import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Ensure this route is always dynamic and never statically cached
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
  const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;
  // removed debug logging

    // Get funds from MongoDB
  const client = await getClientPromise();
  const db = client.db('Defunds'); // Changed to match fund creation API
  const collection = db.collection('Funds'); // Changed to match fund creation API
  const invWithdrawCol = db.collection('invWithdraw');


    const funds = await collection
      // Exclude devnet funds from the public listing
      .find({ cluster: { $ne: 'devnet' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    

    const totalCount = await collection.countDocuments({ cluster: { $ne: 'devnet' } });

    // RPC connection for on-chain AUM computation
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

      // Direct Helius price fetch fallback for any mint missing price or with zero price
      function getHeliusUrl() {
        const key = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY || '';
        const base = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com');
        return base;
      }
      async function fetchPricesDirect(mints: string[]): Promise<Record<string, { priceBaseUnits: string; updatedAt: number }>> {
        const heliusUrl = getHeliusUrl();
        const out: Record<string, { priceBaseUnits: string; updatedAt: number }> = {};
        const nowSec = Math.floor(Date.now() / 1000);
        for (const mint of Array.from(new Set(mints))) {
          try {
            const payload = { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } };
            const resp = await fetch(heliusUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!resp.ok) continue;
            const data: any = await resp.json();
            const tokenInfo = data?.result?.token_info || {};
            const priceInfo = tokenInfo?.price_info || {};
            const pricePerToken = Number(priceInfo?.price_per_token || 0);
            if (pricePerToken > 0) out[mint] = { priceBaseUnits: String(Math.round(pricePerToken * 1_000_000)), updatedAt: nowSec };
          } catch {}
        }
        return out;
      }

    async function computeAumSolFromChain(fundPkStr: string): Promise<number> {
      try {
        const fundPk = new PublicKey(fundPkStr);
        // Swap-page parity: value fund-owned assets only (lamports on fund + ATAs owned by fund)
        const fundLamports = await connection.getBalance(fundPk, { commitment: 'processed' } as any).catch(() => 0);
        let aumSol = fundLamports / 1_000_000_000;

        const tokenAccounts = await connection
          .getParsedTokenAccountsByOwner(fundPk, { programId: TOKEN_PROGRAM_ID as any })
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
        let prices = await fetchPrices(mints);
        // Fallback: fetch missing or zero prices directly from Helius
        const missing = mints.filter(m => !prices[m] || Number(prices[m].priceBaseUnits || '0') <= 0);
        if (missing.length) {
          const direct = await fetchPricesDirect(missing);
          prices = { ...prices, ...direct };
        }
        const solPriceUsd = Number(prices[SOL_MINT]?.priceBaseUnits || '0') / 1_000_000 || 0;
        const solUsd = solPriceUsd > 0 ? solPriceUsd : 1;
        for (const r of rows) {
          if (r.mint === SOL_MINT) {
            aumSol += r.uiAmount; // WSOL counts directly in SOL
            continue;
          }
          const p = prices[r.mint];
          if (!p) { continue; }
          const usdPerToken = Number(p.priceBaseUnits || '0') / 1_000_000;
          const tokenUsd = usdPerToken * r.uiAmount;
          const tokenSol = tokenUsd / solUsd;
          aumSol += tokenSol;
        }
        return aumSol;
      } catch {
        return 0;
      }
    }

    // Transform funds to match expected format
    const transformedFunds = await Promise.all(funds.map(async (fund) => {
      const accessMode = fund.accessMode || fund.access?.type || (fund.isPublic === false ? 'single_code' : 'public');
      const fundId = String(fund.fundId || fund._id);
      // Aggregated metrics
  const aumSol = await computeAumSolFromChain(fundId);
      // Invested: prefer DB totalDeposits; else sum investments
      let invested = Number(fund.totalDeposits || 0);
      if (!invested && Array.isArray(fund.investments)) {
        invested = fund.investments.reduce((s: number, inv: any) => s + Math.max(0, Number(inv.amount || 0)), 0);
      }
      // Withdrawn: from invWithdraw collection for this fund
      const invDoc = await invWithdrawCol.findOne({ _id: fund.manager } as any).catch(() => null) as any;
      const wEntries = Array.isArray(invDoc?.funds?.[fundId]) ? invDoc.funds[fundId] : [];
      const withdrawn = wEntries.reduce((s: number, e: any) => s + Number(e?.amountSol || 0), 0);
      const currentValue = aumSol;
      const pnlSol = currentValue + withdrawn - invested;
      const pnlPctAgg = invested > 0 ? (pnlSol / invested) * 100 : 0;
      // removed PNL debug logs
      
      // Build performance from stored pnl index series if present; fallback to history or seed
      const perfFromPnl = Array.isArray((fund as any).pnl) && (fund as any).pnl.length
        ? (fund as any).pnl
            .slice()
            .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((p: any) => ({ date: new Date(p.date).toISOString(), nav: Number(p.index || 1) }))
        : null;

      // Card P&L% should reflect the aggregate formula using on-chain AUM:
      // pnlPct = (currentValue + withdrawn - invested) / invested * 100
      // Do NOT override with pnl index; keep series only for charting.
      const pnlPct = pnlPctAgg;

      return {
        id: fund._id,
        fundId,
        name: fund.name,
        description: fund.description,
        type: fund.fundType || 'General',
        manager: fund.manager,
        tvl: aumSol, // TVL shows current on-chain value in SOL
        perfFee: fund.performanceFee || 0,
        investorCount: fund.investorCount || 0,
        maxCapacity: fund.maxCapacity || 0,
        isPublic: accessMode === 'public',
        inviteOnly: accessMode !== 'public',
        accessMode, // expose access mode (front-end can decide wording); DOES NOT expose actual codes
        // Aggregated PnL summary for card display
        currentValue,
        invested,
        withdrawn,
        pnlSol,
        pnlPct,
        
        // Performance series for chart: prefer pnl index series; else fallback to any stored history; else seed
        performance: perfFromPnl || fund.performanceHistory || [{
          date: new Date().toISOString(),
          nav: 1.0,
          pnl: 0,
          pnlPercentage: 0
        }],
        
        // Trading stats (will be empty until trading is added)
        // Keep legacy stats shape for compatibility; UI will stop rendering most of it
        stats: fund.stats || { total: 0, wins: 0, losses: 0, avgWinPct: 0, avgWinSol: 0, avgLossPct: 0, avgLossSol: 0, drawdownPct: 0, drawdownSol: 0, topWins: [], topLosses: [] }
      };
    }));

    
    
    return NextResponse.json({
      success: true,
      data: {
        funds: transformedFunds,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        serverTimestamp: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });

  } catch (error) {
    console.error('=== ERROR FETCHING REAL FUNDS ===');
    console.error('Error details:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch funds',
    }, { status: 500 });
  }
}
