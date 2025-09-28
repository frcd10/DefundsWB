'use client';

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Clock3, Zap } from 'lucide-react';
import FilterBar, { Filters } from '@/components/FilterBar';
import FundCard from '@/components/FundCard';
import { FundType, FundCardData } from '@/types/fund';
// Removed mock create modal and mocks usage
import { CreateRealFundModal } from '@/components/CreateRealFundModal';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 21;

interface RealFund {
  id: string; // API returns 'id', not just 'fundId'
  fundId: string;
  manager: string;
  name: string;
  description: string;
  fundType: string;
  type: string; // API returns 'type' as well
  tvl: number; // API returns 'tvl', not 'totalDeposits'
  perfFee: number; // API returns 'perfFee', not 'performanceFee'
  performanceFee: number; // Keep for backward compatibility
  maxCapacity: number;
  maxCap: number; // API returns 'maxCap' as well
  isPublic: boolean;
  inviteOnly: boolean; // API returns 'inviteOnly' as well
  totalDeposits: number; // Keep for backward compatibility
  investorCount: number;
  performance: Array<{ date: string; nav: number; pnl?: number; pnlPercentage?: number }>;
  stats: {
    total: number;
    wins: number;
    losses: number;
    avgWinPct: number;
    avgWinSol: number;
    avgLossPct: number;
    avgLossSol: number;
    drawdownPct: number;
    drawdownSol: number;
    topWins: Array<{ token: string; pct: number; sol: number }>;
    topLosses: Array<{ token: string; pct: number; sol: number }>;
  };
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);          // 0-based
  const [realFunds, setRealFunds] = useState<RealFund[]>([]);
  const [showCreateReal, setShowCreateReal] = useState(false);

  // Load real funds from backend
  const loadRealFunds = async () => {
    try {
      const response = await fetch('/api/funds/real');
      if (response.ok) {
        const data = await response.json();
        setRealFunds(data.data.funds || []);
      }
    } catch (error) {
      console.error('Error loading real funds:', error);
    }
  };

  useEffect(() => {
    loadRealFunds();
  }, []);

  const handleRealFundCreated = (fundId: string) => {
    console.log('Fund created:', fundId);
    loadRealFunds(); // Reload funds
  };

  /* ── Compute visible funds ----------------------------------------- */
  const allFunds: FundCardData[] = realFunds.map(fund => ({
    id: fund.fundId,
    name: fund.name,
    handle: fund.manager.slice(0, 8) + '...',
  creatorWallet: fund.manager,
    traderTwitter: '@' + fund.manager.slice(0, 8),
    description: fund.description,
    type: fund.fundType as FundType,
    tvl: fund.tvl || 0, // Use tvl from API response (already transformed)
    perfFee: fund.perfFee || 0, // Use perfFee from API response (already transformed)
    maxCap: fund.maxCapacity || 0,
    investorCount: fund.investorCount || 0,
    inviteOnly: !fund.isPublic,
    performance: fund.performance || [],
    stats: fund.stats || {
      total: 0,
      wins: 0,
      losses: 0,
      avgWinPct: 0,
      avgWinSol: 0,
      avgLossPct: 0,
      avgLossSol: 0,
      drawdownPct: 0,
      drawdownSol: 0,
      topWins: [],
      topLosses: []
    }
  }));

  const filteredFunds = useMemo(() => {
    return allFunds.filter((f) => {
      if (filters.maxPerfFee !== undefined && f.perfFee > filters.maxPerfFee)
        return false;
      if (filters.maxCap !== undefined && f.maxCap > filters.maxCap) return false;
      if (filters.type && f.type !== filters.type) return false;
      if (filters.query) {
        const q = filters.query.toLowerCase();
        if (
          !f.name.toLowerCase().includes(q) &&
          !f.handle.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [filters, allFunds]);

  /* reset to first page when filters change */
  useEffect(() => setPage(0), [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredFunds.length / PAGE_SIZE));
  const pageSlice = filteredFunds.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  /* ── Handlers ------------------------------------------------------ */
  const prev = () => setPage((p) => Math.max(0, p - 1));
  const next = () => setPage((p) => Math.min(totalPages - 1, p + 1));
  const goto = (i: number) => setPage(i);

  return (
    <main className="min-h-screen bg-sol-900 text-sol-50">
      {/* Hero / Intro similar to RWA */}
      <section className="max-w-6xl mx-auto px-4 pt-24 sm:pt-32 pb-12">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-6xl font-extrabold mb-4 drop-shadow-lg">
            Funds <span className="text-sol-accent">Marketplace</span>
          </h1>
          <p className="text-lg sm:text-xl text-sol-200 mb-8 leading-relaxed">
            Access actively managed token strategies. Delegate capital directly to on-chain
            managers with transparent performance, fees, and 24/7 liquidity—no intermediaries.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
            <Button
              size="lg"
              className="w-64 rounded-xl !bg-sol-accent text-sol-900 font-semibold shadow-lg text-lg transition hover:scale-105"
              onClick={() => {
                const el = document.getElementById('funds-market');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              📊 Browse Funds
            </Button>
            <Button
              size="lg"
              className="w-64 rounded-xl border border-sol-accent text-sol-accent font-semibold text-lg hover:bg-sol-accent/10 transition"
              onClick={() => setShowCreateReal(true)}
            >
              ➕ Create Fund
            </Button>
          </div>

          {/* 3-step banner from Products */}
          <div className="grid md:grid-cols-3 gap-6">
            <IntroStep icon={<TrendingUp className="w-7 h-7 text-sol-accent" />} title="Pick a fund" body="Compare stats, risk and historical NAV. Choose a strategy that fits you." />
            <IntroStep icon={<Zap className="w-7 h-7 text-sol-accent" />} title="Delegate capital" body="Deposit and mint vault shares instantly – assets stay in the program." />
            <IntroStep icon={<Clock3 className="w-7 h-7 text-sol-accent" />} title="Withdraw anytime" body="Redeem shares 24/7; receive SOL back in seconds with transparent fees." />
          </div>
        </div>
      </section>

      {/* Value Props Section migrated */}
      <section className="max-w-6xl mx-auto px-4 pb-6" id="funds-market">
        <h2 className="text-3xl font-bold mb-8">Why On-Chain Funds?</h2>
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ['Decentralized Access', 'Invest permissionlessly from your wallet—no broker forms.'],
            ['Transparent Fees', 'Performance & management fees enforced by code.'],
            ['Real-Time Accounting', 'NAV updates with every on-chain trade settlement.'],
            ['Low Friction', 'Deposit or exit with no lock-ups or quarterly gates.'],
            ['Flexible Allocation', 'Start small, scale anytime; no minimum tickets.'],
            ['Privacy Preserving', 'No KYC for public funds; your address is your identity.'],
          ].map(([t, b]) => (
            <li key={t} className="bg-sol-800/60 rounded-2xl p-5">
              <h3 className="font-semibold mb-1 text-sol-accent">{t}</h3>
              <p className="text-sol-200 text-sm leading-relaxed">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-12" aria-label="Funds marketplace listing">
        <header className="mb-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">All Funds</h2>
          <p className="text-sol-200 text-sm">Filter and explore live strategies</p>
        </header>

  {/* Filters */}
  <FilterBar onChange={setFilters} />

        {/* Cards grid */}
        {pageSlice.length === 0 ? (
          <p className="text-sol-50 text-center py-8">No fund matches your filters.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10">
              {pageSlice.map((f) => (
                <FundCard f={f} key={f.id} />
              ))}
            </div>

            {/* Pagination controls */}
            <nav className="flex items-center justify-center gap-1 sm:gap-2 px-2">
              <button
                onClick={prev}
                disabled={page === 0}
                className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 disabled:opacity-40 text-sm"
              >
                ‹ Prev
              </button>

              {/* small page buttons when ≤ 6 pages, otherwise show 1 … n */}
              {totalPages <= 6
                ? Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goto(i)}
                      className={`px-2 sm:px-3 py-1 rounded-lg text-sm ${
                        page === i
                          ? 'bg-sol-accent text-sol-900 font-semibold'
                          : 'bg-sol-800/60 text-sol-100'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))
                : (
                  <>
                    {page > 1 && (
                      <>
                        <button
                          onClick={() => goto(0)}
                          className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 text-sm"
                        >
                          1
                        </button>
                        {page > 2 && <span className="text-sol-100 text-sm">…</span>}
                      </>
                    )}
                    {page > 0 && (
                      <button
                        onClick={() => goto(page - 1)}
                        className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 text-sm"
                      >
                        {page}
                      </button>
                    )}
                    <button
                      className="px-2 sm:px-3 py-1 rounded-lg bg-sol-accent text-sol-900 font-semibold text-sm"
                    >
                      {page + 1}
                    </button>
                    {page < totalPages - 1 && (
                      <button
                        onClick={() => goto(page + 1)}
                        className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 text-sm"
                      >
                        {page + 2}
                      </button>
                    )}
                    {page < totalPages - 2 && (
                      <>
                        {page < totalPages - 3 && (
                          <span className="text-sol-100 text-sm">…</span>
                        )}
                        <button
                          onClick={() => goto(totalPages - 1)}
                          className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 text-sm"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </>
                )}

              <button
                onClick={next}
                disabled={page === totalPages - 1}
                className="px-2 sm:px-3 py-1 rounded-lg bg-sol-800/60 text-sol-100 disabled:opacity-40 text-sm"
              >
                Next ›
              </button>
            </nav>
          </>
        )}
  </section>

      {/* Real Fund Creation Modal */}
      <CreateRealFundModal
        isOpen={showCreateReal}
        onClose={() => setShowCreateReal(false)}
        onFundCreated={handleRealFundCreated}
      />
    </main>
  );
}

/* Small card for top 3 intro steps */
function IntroStep({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="bg-sol-800/60 rounded-2xl p-6 flex flex-col gap-4 text-left">
      <header className="flex items-center gap-3">
        {icon}
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </header>
      <p className="text-sol-200 text-sm leading-relaxed">{body}</p>
    </article>
  );
}
