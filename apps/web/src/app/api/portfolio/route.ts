import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function GET(req: NextRequest) {
  try {
    console.log('=== GET USER PORTFOLIO API CALLED ===');
    
    const { searchParams } = new URL(req.url);
    const walletAddress = searchParams.get('walletAddress'); // Changed from 'wallet' to 'walletAddress'

    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address is required',
      }, { status: 400 });
    }

    console.log('Getting portfolio for wallet:', walletAddress);

    // Connect to MongoDB
    const client = await getClientPromise();
  const db = client.db('Defunds'); // Match the database name used everywhere else
  const fundsCollection = db.collection('Funds'); // Match the collection name used everywhere else
  const rwaCollection = db.collection('Rwa');
  const invWithdrawCol = db.collection('invWithdraw');

    // Get all funds where this wallet is involved
    const funds = await fundsCollection.find({
      $or: [
        { manager: walletAddress }, // Funds managed by this wallet
        { 'investments.walletAddress': walletAddress } // Funds invested in by this wallet
      ]
    }).toArray();

    console.log('Found funds for wallet:', funds.length);

    // Transform funds into portfolio positions
    // Preload invWithdraw map for this investor
  const invDoc = await invWithdrawCol.findOne({ _id: walletAddress } as any)
  const withdrawMap: Record<string, Array<{ amountSol: number }>> = (invDoc?.funds as any) || {}

    // Helper: Connection using server env (Helius supported)
    const rpcUrl = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(rpcUrl, 'confirmed');

    // Helper: fetch prices for a set of mints via backend /api/prices (which uses Helius getAsset under the hood)
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
        const [lamports, tokenAccounts] = await Promise.all([
          connection.getBalance(fundPk, { commitment: 'processed' } as any).catch(() => 0),
          connection.getParsedTokenAccountsByOwner(fundPk, { programId: TOKEN_PROGRAM_ID as any }).catch(() => ({ value: [] as any[] } as any)),
        ]);
        let aumSol = lamports / 1_000_000_000;
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
        const solUsd = solPriceUsd > 0 ? solPriceUsd : 1; // fallback to 1 to avoid division by zero
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

    const positions = await Promise.all(funds.map(async (fund) => {
      console.log('Processing fund:', fund.name, 'for wallet:', walletAddress);
      
      const isManager = fund.manager === walletAddress;
      let userShares = 0;
      let totalInvested = 0;
      let investmentHistory: Array<{ walletAddress: string; amount: number; shares: number; timestamp: string; transactionSignature: string; type: string }> = [];

      if (fund.investments && fund.investments.length > 0) {
        // Find all investments by this wallet
        const userInvestments = fund.investments.filter((inv: { walletAddress: string }) => 
          inv.walletAddress === walletAddress
        );
        
        console.log('Found user investments:', userInvestments.length);
        
        if (userInvestments.length > 0) {
          userShares = userInvestments.reduce((sum: number, inv: { shares?: number }) => sum + (inv.shares || 0), 0);
          totalInvested = userInvestments.reduce((sum: number, inv: { amount?: number }) => sum + (inv.amount || 0), 0);
          investmentHistory = userInvestments;
        }
      } else if (isManager) {
        // If no investments array but user is manager, they have the initial position
        userShares = fund.totalShares || 0;
        totalInvested = fund.totalDeposits || 0;
      }

      if (userShares <= 0) {
        return null; // Skip if no position
      }

  const totalShares = Math.max(0, fund.totalShares || 0)
      const sharePercentage = totalShares > 0 ? (userShares / totalShares) * 100 : 0
  // AUM in SOL computed from on-chain holdings and Helius-backed prices
  const aumSol: number = await computeAumSolFromChain(String(fund._id))
  // Current value = ownership x AUM (SOL)
  const currentValue = totalShares > 0 ? (aumSol * (userShares / totalShares)) : 0
      
      // Calculate P&L (difference between current value and what was invested)
      // const pnl = currentValue - totalInvested;
      // Remove unused variable
      // const pnlPercentage = totalInvested > 0 ? (pnl / totalInvested) * 100 : 0;

      // Calculate user's total withdrawals from this fund
      // Withdrawn from invWithdraw collection (preferred, SOL units)
  const fundIdStr = String(fund._id)
  const wEntries = Array.isArray(withdrawMap?.[fundIdStr]) ? withdrawMap[fundIdStr] : []
  const totalWithdrawals = wEntries.reduce((s: number, e: { amountSol?: number }) => s + Number(e?.amountSol || 0), 0)

      console.log('Position calculated:');
      console.log('- User shares:', userShares);
      console.log('- Total invested:', totalInvested);
      console.log('- Total withdrawn:', totalWithdrawals);
      console.log('- Current value:', currentValue);

      return {
        fundId: fund._id,
        fundName: fund.name,
        fundType: fund.fundType || 'General',
        sharePercentage,
        userShares,
        totalShares,
        aumSol,
        currentValue,
        initialInvestment: totalInvested,
        totalWithdrawals,
        investmentHistory,
        lastUpdated: fund.updatedAt ? new Date(fund.updatedAt).toISOString() : new Date().toISOString()
      };
    }))
    .then(arr => arr.filter((position) => position !== null)); // Remove null positions

    console.log('Final positions:', positions.length);

    // RWA positions for this wallet (investments only)
    const rwaDocs = await rwaCollection.find({ 'investments.walletAddress': walletAddress }).toArray();
    console.log('Found RWA products with investments from wallet:', rwaDocs.length);

    const rwaPositions = rwaDocs.map((p: any) => {
      const userInvestments = (p.investments || []).filter((inv: any) => inv.walletAddress === walletAddress);
      if (userInvestments.length === 0) return null;

  const userSharesRaw = userInvestments.reduce((sum: number, inv: any) => sum + (inv.shares || 0), 0);
  const userShares = Math.max(0, userSharesRaw);
  const invested = userInvestments.reduce((sum: number, inv: any) => sum + Math.max(0, inv.amount || 0), 0);
  // Prefer sum of non-negative investment shares for effective total shares
  const sumNonNegShares = (p.investments || []).reduce((s: number, inv: any) => s + Math.max(0, inv.shares || 0), 0);
  const storedTotal = Math.max(0, p.totalShares || 0);
  const totalShares = sumNonNegShares > 0 ? sumNonNegShares : storedTotal;
  const ownership = totalShares > 0 ? Math.min(100, (userShares / totalShares) * 100) : 0;
      const payments = Array.isArray(p.payments) ? p.payments : [];
      const received = payments.reduce((sum: number, pay: any) => {
        const rec = Array.isArray(pay.recipients) ? pay.recipients : [];
        const mine = rec.find((r: any) => r.wallet === walletAddress);
        return sum + (mine ? (mine.amountSol || 0) : 0);
      }, 0);

      return {
        fundId: p.fundId,
        name: p.name,
        type: p.fundType || 'General',
        invested,
        received,
        ownership,
        userShares,
        totalShares,
        lastUpdated: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      };
    }).filter(Boolean);

    // Calculate total portfolio values
  const totalValue = positions.reduce((sum, pos) => sum + pos.currentValue, 0);
  const totalInvested = positions.reduce((sum, pos) => sum + pos.initialInvestment, 0);
  const totalWithdrawn = positions.reduce((sum, pos) => sum + pos.totalWithdrawals, 0);
    
    // New P&L calculation: P&L = Total Value + Total Withdrawn - Total Invested
    const totalPnL = totalValue + totalWithdrawn - totalInvested;
    const totalPnLPercentage = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    console.log('Portfolio totals:');
    console.log('- Total Value:', totalValue);
    console.log('- Total Invested:', totalInvested);
    console.log('- Total Withdrawn:', totalWithdrawn);
    console.log('- Total P&L:', totalPnL);

    return NextResponse.json({
      success: true,
      data: {
        totalValue,
        totalInvested,
        totalWithdrawn,
        totalPnL,
        totalPnLPercentage,
        activeFunds: positions.length,
        positions,
        rwaPositions,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('=== ERROR GETTING PORTFOLIO ===');
    console.error('Error details:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get portfolio',
    }, { status: 500 });
  }
}
