'use client';

import { useState, useEffect, useMemo } from 'react';
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
    <main className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800">
      <section className="max-w-6xl mx-auto px-4 py-12 sm:py-20">
        {/* Hero */}
        <header className="mb-8 sm:mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white drop-shadow-lg mb-2 sm:mb-4">
            Solana Managed Funds
          </h1>
          <p className="text-sol-50 text-sm sm:text-base mb-4 sm:mb-6">
            The first marketplace where traders launch token funds on&nbsp;Solana.
          </p>
          
          {/* Create Button */}
          <div className="flex flex-wrap gap-3 justify-center items-center mb-6">
            <Button
              onClick={() => setShowCreateReal(true)}
              className="rounded-xl !bg-sol-accent text-sol-900 font-bold hover:!bg-sol-accent hover:scale-105 transition"
            >
              Create a fund
            </Button>
          </div>
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
