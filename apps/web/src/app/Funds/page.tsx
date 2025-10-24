'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Clock3, Zap, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { usePublicProfiles } from '@/lib/hooks/usePublicProfiles';
import { PublicProfileModal } from '@/components/PublicProfileModal';
import FilterBar, { Filters } from '@/components/FilterBar';
// import FundCard from '@/components/FundCard'; // legacy card view (no longer used)
import { FundType, FundCardData } from '@/types/fund';
// Removed mock create modal and mocks usage
import { CreateRealFundModal } from '@/components/CreateRealFundModal';
import { Button } from '@/components/ui/button';
import { InvestInFundModal } from '@/components/InvestInFundModal';
import { HowItWorksModal } from '@/components/HowItWorksModal';
import { formatSol } from '@/lib/formatters';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

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
  accessMode?: 'public' | 'single_code' | 'multi_code';
  totalDeposits: number; // Keep for backward compatibility
  investorCount: number;
  performance: Array<{ date: string; nav: number; pnl?: number; pnlPercentage?: number }>;
  // Aggregated metrics
  currentValue?: number;
  invested?: number;
  withdrawn?: number;
  pnlSol?: number;
  pnlPct?: number;
}

export default function Home() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);          // 0-based
  const [realFunds, setRealFunds] = useState<RealFund[]>([]);
  const [showCreateReal, setShowCreateReal] = useState(false);
  const [selectedFundForInvest, setSelectedFundForInvest] = useState<FundCardData | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Load real funds from backend
  const loadRealFunds = async () => {
    try {
      const response = await fetch('/api/funds/real', { cache: 'no-store' });
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

  // Refresh funds when the page/tab gains focus or becomes visible
  useEffect(() => {
    const onFocus = () => loadRealFunds();
    const onVisibility = () => { if (document.visibilityState === 'visible') loadRealFunds(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleRealFundCreated = (fundId: string) => {
    console.log('Fund created:', fundId);
    loadRealFunds(); // Reload funds
  };

  /* ── Compute visible funds ----------------------------------------- */
  const allFunds: FundCardData[] = realFunds.map(fund => ({
    id: fund.fundId,
    fundId: fund.fundId,
    name: fund.name,
    handle: fund.manager.slice(0, 8) + '...',
  creatorWallet: fund.manager,
    traderTwitter: '@' + fund.manager.slice(0, 8),
    description: fund.description,
    // Some API payloads might contain either fundType or type; provide fallback to avoid blank UI cells
    type: (fund.fundType || (fund as any).type || 'Long Only') as FundType,
    tvl: fund.tvl || 0, // Use tvl from API response (already transformed)
    perfFee: fund.perfFee || 0, // Use perfFee from API response (already transformed)
    maxCap: fund.maxCapacity || 0,
    investorCount: fund.investorCount || 0,
    inviteOnly: !fund.isPublic,
    accessMode: fund.accessMode as any,
    performance: fund.performance || [],
    stats: { total: 0, wins: 0, losses: 0, avgWinPct: 0, avgWinSol: 0, avgLossPct: 0, avgLossSol: 0, drawdownPct: 0, drawdownSol: 0, topWins: [], topLosses: [] },
    currentValue: fund.currentValue,
    invested: fund.invested,
    withdrawn: fund.withdrawn,
    pnlSol: fund.pnlSol,
    pnlPct: fund.pnlPct,
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

  /* Sorting --------------------------------------------------------- */
  const [sort, setSort] = useState<{ key: keyof FundCardData; dir: 'asc' | 'desc' }>({ key: 'tvl', dir: 'desc' });

  const sortedFunds = useMemo(() => {
    const arr = [...filteredFunds];
    arr.sort((a, b) => {
      const { key, dir } = sort;
      const av = (a as any)[key];
      const bv = (b as any)[key];
      if (av == null && bv == null) return 0;
      if (av == null) return dir === 'asc' ? -1 : 1;
      if (bv == null) return dir === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return dir === 'asc' ? -1 : 1;
      if (as > bs) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    // Pin a specific fund to always appear first
    const PIN_ID = '2yJ2GV3Ua8mkWd2wHFKtCRwHBo4KBP6FJjXcbphXGpLN';
    const idx = arr.findIndex(f => f.id === PIN_ID);
    if (idx > 0) {
      const [pinned] = arr.splice(idx, 1);
      arr.unshift(pinned);
    }
    return arr;
  }, [filteredFunds, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedFunds.length / PAGE_SIZE));
  const pageSlice = sortedFunds.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  /* ── Handlers ------------------------------------------------------ */
  const prev = () => setPage((p) => Math.max(0, p - 1));
  const next = () => setPage((p) => Math.min(totalPages - 1, p + 1));
  const goto = (i: number) => setPage(i);

  return (
    <main className="min-h-screen bg-brand-black text-white">
      {/* Hero / Intro */}
  <section className="max-w-6xl mx-auto px-4 pt-10 sm:pt-12 pb-10">
        <div className="text-center max-w-5xl mx-auto">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold mb-6 leading-tight">
            Explore <span className="text-brand-yellow">Funds</span>
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              className="inline-flex items-center justify-center rounded-full bg-brand-yellow px-8 py-4 text-base font-semibold text-brand-black hover:brightness-110 transition min-w-[220px]"
              onClick={() => {
                const el = document.getElementById('funds-market');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              📊 Browse Funds
            </button>
            <button
              className="inline-flex items-center justify-center rounded-full border border-brand-yellow/80 px-8 py-4 text-base font-semibold text-brand-yellow hover:bg-brand-yellow hover:text-brand-black transition min-w-[220px]"
              onClick={() => setShowCreateReal(true)}
            >
              ➕ Create Fund
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <IntroStep icon={<TrendingUp className="w-7 h-7 text-brand-yellow" />} title="Pick a fund" body="Compare stats, risk and historical NAV. Choose a strategy that fits you." />
            <IntroStep icon={<Zap className="w-7 h-7 text-brand-yellow" />} title="Delegate capital" body="Deposit and mint vault shares instantly – assets stay in the program." />
            <IntroStep icon={<Clock3 className="w-7 h-7 text-brand-yellow" />} title="Shared Vault Performance" body="Manager trades inside the vault — all participants realize the same percentage PnL; no spreads and no exit‑liquidity." />
          </div>
        </div>
      </section>

      
      <section className="max-w-6xl mx-auto px-4 py-0" aria-label="Funds marketplace listing">


  {/* Filters */}
  <FilterBar onChange={setFilters} />

        {/* Cards grid */}
        {pageSlice.length === 0 ? (
          <p className="text-white/80 text-center py-4">No fund matches your filters.</p>
        ) : (
          <>
            <FundsTable
              funds={pageSlice}
              sort={sort}
              onSort={(k) =>
                setSort((prev) =>
                  prev.key === k
                    ? { key: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                    : { key: k, dir: k === 'name' ? 'asc' : 'desc' }
                )
              }
            />

            {/* Pagination controls */}
            <nav className="flex items-center justify-center gap-1 sm:gap-2 px-2">
              <button
                onClick={prev}
                disabled={page === 0}
                className="px-2 sm:px-3 py-4 rounded-lg bg-white/5 text-white/70 disabled:opacity-30 text-sm hover:text-white hover:bg-white/10 transition"
              >
                ‹ Prev
              </button>

              {/* small page buttons when ≤ 6 pages, otherwise show 1 … n */}
              {totalPages <= 6
                ? Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goto(i)}
                      className={`px-2 sm:px-3 py-1 rounded-lg text-sm transition ${
                        page === i
                          ? 'bg-brand-yellow text-brand-black font-semibold'
                          : 'bg-brand-surface text-white/70 hover:text-white hover:bg-brand-surface/80'
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
                          className="px-2 sm:px-3 py-1 rounded-lg bg-white/5 text-white/70 text-sm hover:text-white hover:bg-white/10 transition"
                        >
                          1
                        </button>
                        {page > 2 && <span className="text-white/60 text-sm">…</span>}
                      </>
                    )}
                    {page > 0 && (
                      <button
                        onClick={() => goto(page - 1)}
                        className="px-2 sm:px-3 py-1 rounded-lg bg-brand-surface text-white/70 text-sm hover:text-white hover:bg-brand-surface/80 transition"
                      >
                        {page}
                      </button>
                    )}
                    <button
                      className="px-2 sm:px-3 py-1 rounded-lg bg-brand-yellow text-brand-black font-semibold text-sm"
                    >
                      {page + 1}
                    </button>
                    {page < totalPages - 1 && (
                      <button
                        onClick={() => goto(page + 1)}
                        className="px-2 sm:px-3 py-1 rounded-lg bg-brand-surface text-white/70 text-sm hover:text-white hover:bg-brand-surface/80 transition"
                      >
                        {page + 2}
                      </button>
                    )}
                    {page < totalPages - 2 && (
                      <>
                        {page < totalPages - 3 && (
                          <span className="text-white/60 text-sm">…</span>
                        )}
                        <button
                          onClick={() => goto(totalPages - 1)}
                          className="px-2 sm:px-3 py-1 rounded-lg bg-brand-surface text-white/70 text-sm hover:text-white hover:bg-brand-surface/80 transition"
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
                className="px-2 sm:px-3 py-1 rounded-lg bg-white/5 text-white/70 disabled:opacity-30 text-sm hover:text-white hover:bg-white/10 transition"
              >
                Next ›
              </button>
            </nav>
          </>
        )}
  </section>

  {/* Value Props */}
      <section id="funds-market" className="max-w-6xl mx-auto px-4 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Why On-Chain Funds?</h2>
          <button
            onClick={() => setShowHowItWorks(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-yellow text-brand-black font-semibold text-sm px-6 py-3 hover:brightness-110 transition shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
            aria-label="Open How It Works"
          >
            <Info className="w-4 h-4" /> How it works
          </button>
        </div>
        <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ['Decentralized Access', 'Invest permissionlessly from your wallet — no broker forms.'],
            ['Transparent Fees', 'Performance & management fees enforced by open-source code.'],
            ['Real-Time Accounting', 'NAV updates with each on-chain trade settlement.'],
            ['Low Friction', 'Deposit or exit anytime. No quarterly gates or lock-ups.'],
            ['Flexible Allocation', 'Start small, scale anytime; no minimum tickets.'],
            ['Privacy Preserving', 'For public funds your address is your identity.'],
          ].map(([t, b]) => (
            <li key={t} className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
              <h3 className="font-semibold mb-2 text-brand-yellow">{t}</h3>
              <p className="text-sm leading-relaxed text-white/70">{b}</p>
            </li>
          ))}
        </ul>
      </section>


      {/* Real Fund Creation Modal */}
      <CreateRealFundModal
        isOpen={showCreateReal}
        onClose={() => setShowCreateReal(false)}
        onFundCreated={handleRealFundCreated}
      />
      <HowItWorksModal isOpen={showHowItWorks} onClose={() => setShowHowItWorks(false)} />
    </main>
  );
}

/* Small card for top 3 intro steps */
function IntroStep({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10 flex flex-col gap-4 text-left">
      <header className="flex items-center gap-3">
        {icon}
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </header>
      <p className="text-sm leading-relaxed text-white/70">{body}</p>
    </article>
  );
}

/* ------------------------------------------------------------------
   FundsTable – institutional list with expandable detail rows
------------------------------------------------------------------- */
function FundsTable({
  funds,
  sort,
  onSort,
}: {
  funds: FundCardData[];
  sort: { key: keyof FundCardData; dir: 'asc' | 'desc' };
  onSort: (k: keyof FundCardData) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedMobile, setExpandedMobile] = useState<Set<string>>(new Set());
  // invite codes now handled inside investment modal only
  const [investTarget, setInvestTarget] = useState<FundCardData | null>(null);
  const { getProfile, cache } = usePublicProfiles();
  const [profileWallet, setProfileWallet] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const headerCell = (label: string, key: keyof FundCardData) => {
    const active = sort.key === key;
    return (
      <th
        onClick={() => onSort(key)}
        className={`px-4 py-3 text-left text-xs font-semibold tracking-wide cursor-pointer select-none whitespace-nowrap ${active ? 'text-white' : 'text-white/70'} hover:text-white transition`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sort.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </span>
      </th>
    );
  };

  return (
  <>
    {/* Mobile cards */}
    <div className="md:hidden space-y-3">
      {funds.map((f) => {
        const isOpen = expandedMobile.has(f.id);
        const toggleMobile = () => {
          setExpandedMobile((prev) => {
            const next = new Set(prev);
            if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
            return next;
          });
        };
        // Normalize performance to ensure a baseline (nav=1.0) so chart shows 0%, 6.13%, 7.88%, ...
        const perfSorted = (f.performance || [])
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const perfWithBaseline = (() => {
          if (perfSorted.length === 0) return perfSorted;
          const first = perfSorted[0];
          const firstNav = Number((first as any).nav || 0);
          if (!Number.isFinite(firstNav) || Math.abs(firstNav - 1) < 1e-9) return perfSorted;
          const firstDate = new Date(first.date);
          const baselineDate = new Date(firstDate.getTime() - 24 * 60 * 60 * 1000);
          return [{ date: baselineDate.toISOString(), nav: 1 }, ...perfSorted];
        })();
        const performanceData = perfWithBaseline.map((p) => {
          const base = 1; // baseline always 1.0
          const nav = Number((p as any).nav || 1);
          const pnl = nav - base;
          const pnlPercentage = (nav - 1) * 100;
          return { ...(p as any), pnl, pnlPercentage };
        });
        const last = performanceData.length ? performanceData[performanceData.length - 1] : undefined;
        const pnlPct = typeof last?.pnlPercentage === 'number' ? last.pnlPercentage : 0;
        const pnlSol = typeof last?.pnl === 'number' ? last.pnl : 0;
        const prof = f.creatorWallet ? cache[f.creatorWallet] : undefined;
        const creatorLabel = f.creatorWallet
          ? (prof?.name ? prof.name : f.creatorWallet.slice(0,4)+"..."+f.creatorWallet.slice(-4))
          : '';
        return (
          <div key={f.id} className="bg-brand-surface/70 border border-white/10 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-white truncate" title={f.name}>{f.name}</div>
                <div className="text-[11px] text-white/50 flex items-center gap-2 mt-0.5">
                  <span>{String(f.fundId || f.id).slice(0,8)}...{String(f.fundId || f.id).slice(-6)}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(f.fundId || f.id))}
                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70"
                  >Copy</button>
                </div>
                {f.creatorWallet && (
                  <div className="text-[11px] text-white/60 mt-0.5">
                    <span className="text-white/40">by </span>
                    <button
                      type="button"
                      onClick={() => { getProfile(f.creatorWallet!); setProfileWallet(f.creatorWallet!); }}
                      className="text-brand-yellow hover:underline decoration-dashed underline-offset-2"
                    >{creatorLabel}</button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setInvestTarget(f)}
                className="shrink-0 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-4 py-2 hover:brightness-110 transition"
              >Invest</button>
            </div>

            {/* Summary metrics */}
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/80">
              <li className="bg-white/5 rounded-lg border border-white/10 p-2 flex items-center justify-between"><span className="text-white/60">Current Value</span><span className="font-medium text-white">{formatSol(f.currentValue ?? f.tvl)} SOL</span></li>
              <li className="bg-white/5 rounded-lg border border-white/10 p-2 flex items-center justify-between"><span className="text-white/60">Invested</span><span className="font-medium">{formatSol(f.invested ?? 0)} SOL</span></li>
              <li className="bg-white/5 rounded-lg border border-white/10 p-2 flex items-center justify-between"><span className="text-white/60">Withdrawn</span><span className="font-medium text-orange-300">{formatSol(f.withdrawn ?? 0)} SOL</span></li>
              <li className="bg-white/5 rounded-lg border border-white/10 p-2 flex items-center justify-between"><span className="text-white/60">P&L</span><span className={`font-medium ${((f.pnlSol ?? 0) >= 0) ? 'text-emerald-300' : 'text-red-300'}`}>{(f.pnlSol ?? 0) >= 0 ? '+' : ''}{formatSol(f.pnlSol ?? 0)} SOL ({(f.pnlPct ?? 0).toFixed(2)}%)</span></li>
            </ul>

            {/* PnL Summary */}
            <div className="mt-3 bg-white/5 rounded-lg border border-white/10 p-3">
              <div className="text-[11px] uppercase tracking-wide text-white/50 mb-1">P&L Performance</div>
              {performanceData.length > 1 ? (
                <div className="text-sm">
                  <span className={pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</span>
                  <span className="text-white/60 text-xs ml-2">({pnlSol.toFixed(2)} SOL)</span>
                </div>
              ) : (
                <div className="text-xs text-white/60">Insufficient data</div>
              )}
            </div>

            {/* Expand details */}
            <div className="mt-3">
              <button
                onClick={toggleMobile}
                className="w-full text-left text-xs text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 inline-flex items-center justify-between"
              >
                <span>Details</span>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {isOpen && (
                <div className="pt-3 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">Description</h4>
                    <p className="text-xs text-white/70 leading-relaxed">{f.description || '—'}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Fund Summary</h4>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-white/80">
                      <li>Current Value: <span className="text-white font-medium">{formatSol(f.currentValue ?? f.tvl)} SOL</span></li>
                      <li>Invested: <span className="text-white font-medium">{formatSol(f.invested ?? 0)} SOL</span></li>
                      <li>Withdrawn: <span className="text-orange-300 font-medium">{formatSol(f.withdrawn ?? 0)} SOL</span></li>
                      <li>P&L: <span className={`${((f.pnlSol ?? 0) >= 0) ? 'text-emerald-300' : 'text-red-300'} font-medium`}>{(f.pnlSol ?? 0) >= 0 ? '+' : ''}{formatSol(f.pnlSol ?? 0)} SOL ({(f.pnlPct ?? 0).toFixed(2)}%)</span></li>
                    </ul>
                  </div>
                  {f.inviteOnly && (
                    <div className="text-[11px] font-medium text-brand-yellow/90 bg-brand-yellow/10 border border-brand-yellow/30 px-2 py-1.5 rounded-md inline-block">
                      Invite code required
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {/* Desktop table */}
    <div className="hidden md:block border border-white/10 rounded-2xl overflow-hidden bg-brand-surface/70 backdrop-blur-sm">
      <table className="w-full border-collapse text-sm">
        <thead>
      <tr className="bg-brand-surface text-white/90">
            <th className="w-10"></th>
            {headerCell('Fund', 'name')}
            {headerCell('Type', 'type')}
            {headerCell('TVL (SOL)', 'tvl')}
            {headerCell('P&L %', 'pnlPct' as any)}
            {headerCell('Perf Fee %', 'perfFee')}
            {headerCell('Investors', 'investorCount')}
            <th className="px-4 py-3 text-right text-xs font-semibold text-white/70">Actions</th>
          </tr>
        </thead>
  <tbody className="divide-y divide-white/5 bg-brand-surface">
          {funds.map((f) => {
            const isOpen = expanded.has(f.id);
            // Normalize performance to ensure a baseline (nav=1.0)
            const perfSorted = (f.performance || [])
              .slice()
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const perfWithBaseline = (() => {
              if (perfSorted.length === 0) return perfSorted;
              const first = perfSorted[0];
              const firstNav = Number((first as any).nav || 0);
              if (!Number.isFinite(firstNav) || Math.abs(firstNav - 1) < 1e-9) return perfSorted;
              const firstDate = new Date(first.date);
              const baselineDate = new Date(firstDate.getTime() - 24 * 60 * 60 * 1000);
              return [{ date: baselineDate.toISOString(), nav: 1 }, ...perfSorted];
            })();
            const performanceData = perfWithBaseline.map((p) => {
              const base = 1;
              const nav = Number((p as any).nav || 1);
              const pnlPercentage = (nav - 1) * 100;
              return { ...(p as any), pnlPercentage };
            });
            return (
              <React.Fragment key={`row-${f.id}`}>
                <tr
                  key={f.id}
                  className="group transition bg-brand-surface hover:bg-brand-yellow/5 hover:shadow-[0_0_0_1px_rgba(255,219,41,0.25)] hover:-translate-y-[1px] duration-200 ease-out"
                >
                  <td className="px-2 py-3 align-top">
                    <button
                      onClick={() => toggle(f.id)}
                      className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 group-hover:bg-brand-yellow/10 group-hover:border-brand-yellow/30 group-hover:text-white"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top font-medium text-white whitespace-nowrap max-w-[320px]">
                    <div className="truncate" title={f.name}>{f.name}</div>
                    {f.creatorWallet && (
                      <div className="mt-1 text-[11px] font-normal text-white/50 leading-tight">
                        <span className="text-white/40">by </span>
                        {(() => {
                          const prof = cache[f.creatorWallet];
                          const label = prof?.name ? prof.name : f.creatorWallet.slice(0,4)+"..."+f.creatorWallet.slice(-4);
                          return <button
                            type="button"
                            onClick={() => { if (f.creatorWallet) { getProfile(f.creatorWallet); setProfileWallet(f.creatorWallet); } }}
                            className="text-brand-yellow hover:underline decoration-dashed underline-offset-2"
                          >{label}</button>;
                        })()}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-white/50 flex items-center gap-2">
                      <span className="truncate">{String(f.fundId || f.id).slice(0,8)}...{String(f.fundId || f.id).slice(-6)}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(String(f.fundId || f.id))}
                        className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70"
                      >Copy</button>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-white/70 whitespace-nowrap">{f.type}</td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{formatSol(f.tvl)}</td>
                  <td className="px-4 py-3 align-top tabular-nums">
                    {(() => {
                      const p = Number((f as any).pnlPct ?? 0);
                      const cls = p >= 0 ? 'text-emerald-400' : 'text-red-400';
                      const sign = p >= 0 ? '+' : '';
                      return <span className={`font-medium ${cls}`}>{sign}{p.toFixed(2)}%</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{f.perfFee}%</td>
                  <td className="px-4 py-3 align-top tabular-nums text-white/80">{f.investorCount}</td>
                  <td className="px-4 py-3 align-top text-right">
                    <button
                      onClick={() => setInvestTarget(f)}
                      className="inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-4 py-2 hover:brightness-110 transition"
                    >
                      Invest
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-brand-surface" key={f.id + '-detail'}>
                    <td colSpan={10} className="p-0">
                      {/* Full-width panel to avoid black gaps and fill grey area edge-to-edge */}
                      <div className="bg-white/5 border-t border-white/10 p-4 px-6">
                        <div className="grid lg:grid-cols-3 gap-6">
                        {/* Meta / Stats */}
                        <div className="space-y-6 lg:col-span-1">
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-1">Description</h4>
                            <p className="text-xs text-white/70 leading-relaxed">
                              {f.description || '—'}
                            </p>
                          </div>
                          {/* Mobile-only compact performance summary */}
                          {(() => {
                            const last = (performanceData && performanceData.length > 0)
                              ? performanceData[performanceData.length - 1]
                              : undefined;
                            const pnlPct = typeof last?.pnlPercentage === 'number' ? last.pnlPercentage : 0;
                            const pnlSol = typeof last?.pnl === 'number' ? last.pnl : 0;
                            return (
                              <div className="md:hidden bg-white/5 rounded-xl p-3 border border-white/10">
                                <div className="text-xs font-semibold text-white mb-1">P&L Performance</div>
                                {performanceData.length > 1 ? (
                                  <div className="text-sm">
                                    <span className={pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                                    </span>
                                    <span className="text-white/60 text-xs ml-2">({pnlSol.toFixed(2)} SOL)</span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-white/60">Insufficient data</div>
                                )}
                              </div>
                            );
                          })()}
                          {/* Removed legacy stats and top wins/losses. Show summary metrics instead. */}
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-2">Fund Summary</h4>
                            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-white/80">
                              <li>Current Value: <span className="text-white font-medium">{formatSol(f.currentValue ?? f.tvl)} SOL</span></li>
                              <li>Invested: <span className="text-white font-medium">{formatSol(f.invested ?? 0)} SOL</span></li>
                              <li>Withdrawn: <span className="text-orange-300 font-medium">{formatSol(f.withdrawn ?? 0)} SOL</span></li>
                              <li>P&L: <span className={`${((f.pnlSol ?? 0) >= 0) ? 'text-emerald-300' : 'text-red-300'} font-medium`}>{(f.pnlSol ?? 0) >= 0 ? '+' : ''}{formatSol(f.pnlSol ?? 0)} SOL ({(f.pnlPct ?? 0).toFixed(2)}%)</span></li>
                            </ul>
                          </div>
                          {f.inviteOnly && (
                            <div className="text-[11px] font-medium text-brand-yellow/90 bg-brand-yellow/10 border border-brand-yellow/30 px-2 py-1.5 rounded-md inline-block">
                              Invite code required
                            </div>
                          )}
                          <div>
                            <button
                              onClick={() => setInvestTarget(f)}
                              className="inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black text-xs font-semibold px-5 py-2 hover:brightness-110 transition"
                            >Invest Now</button>
                          </div>
                        </div>
                        {/* Chart (hidden on mobile) */}
                        <div className="hidden md:block lg:col-span-2 min-w-0">
                          <h4 className="text-sm font-semibold text-white mb-3">P&L Performance</h4>
                          <div className="h-56 bg-brand-surface/80 border border-white/10 rounded-xl p-3 w-full overflow-hidden">
                            {performanceData.length > 1 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={performanceData} margin={{ top: 0, right: -1, bottom: 0, left: 0 }}>
                                  <Line type="monotone" dataKey="pnlPercentage" stroke="var(--color-brand-yellow)" strokeWidth={2} dot={{ r: 3, stroke: '#111', strokeWidth: 1, fill: 'var(--color-brand-yellow)' }} activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2, fill: '#ffffff' }} />
                                  <XAxis dataKey="date" hide />
                                  <YAxis hide domain={[dataMin => Math.min(dataMin as number, -1), dataMax => Math.max(dataMax as number, 1)]} />
                                  <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'PnL %']} labelFormatter={() => ''} contentStyle={{ background: 'rgba(20,20,20,0.9)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }} itemStyle={{ color: '#fff' }} labelStyle={{ color: '#fff' }} />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div className="flex items-center justify-center h-full text-xs text-white/50">Insufficient data</div>
                            )}
                          </div>
                        </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {funds.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-sm text-white/60">No fund matches your filters.</td>
            </tr>
          )}
        </tbody>
      </table>
      {/* Local invest modal */}
      {investTarget && (
        <InvestInFundModal
          isOpen={true}
          onClose={() => setInvestTarget(null)}
          fundId={investTarget.id}
          fundName={investTarget.name}
          isRwa={false}
          requiresInviteCode={investTarget.inviteOnly}
          accessMode={investTarget.accessMode}
        />
      )}
      {profileWallet && (
        <PublicProfileModal
          open={true}
          onOpenChange={(v) => { if (!v) setProfileWallet(null); }}
          profile={cache[profileWallet]}
        />
      )}
    </div>
  </>
  );
}
