'use client';
import { FundCardData } from '@/types/fund';
import { useState } from 'react';
import { InvestInFundModal } from './InvestInFundModal';
import Link from 'next/link';
import { formatSol } from '@/lib/formatters';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function FundCard({ f }: { f: FundCardData }) {
  const [details, setDetails] = useState(false);
  // invite code no longer entered here; handled in investment modal
  const [showInvestModal, setShowInvestModal] = useState(false);

  // Transform performance data to show PnL instead of cumulative NAV
  const performanceData = f.performance.map((point) => {
    // If pnl field exists, use it directly
    if ('pnl' in point && point.pnl !== undefined) {
      return point;
    }
    
    // Otherwise, calculate PnL from NAV (for mock funds)
    // PnL = current NAV - initial NAV (assuming initial NAV was around 10-11)
    const initialNav = f.performance[0]?.nav || 10;
    const pnl = point.nav - initialNav;
    
    return {
      ...point,
      pnl: pnl,
      pnlPercentage: ((point.nav - initialNav) / initialNav) * 100
    };
  });

  const invest = () => {
    setShowInvestModal(true);
    console.log('Opening investment modal for fund:', f.id);
  };

  const handleInvestmentComplete = (signature: string) => {
    console.log('Investment completed with signature:', signature);
    // TODO: Refresh fund data or show success message
    alert(`Investment successful! Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`);
  };

  return (
    <div className="rounded-2xl p-4 sm:p-6 bg-white/5 backdrop-blur-sm border border-white/10">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start mb-1">
        <h3 className="text-base sm:text-lg font-bold text-white leading-tight pr-2">{f.name}</h3>
        <span className="px-2 py-1 rounded-lg bg-brand-yellow text-brand-black text-xs font-semibold whitespace-nowrap">
          {f.type}
        </span>
      </div>
      {f.creatorWallet && (
        <div className="mb-3 -mt-0.5 text-xs text-white/60">
          Creator:&nbsp;
          <Link href={`/profile/${f.creatorWallet}`} className="text-brand-yellow hover:underline">
            {f.handle || f.creatorWallet.slice(0, 6) + '...' + f.creatorWallet.slice(-4)}
          </Link>
        </div>
      )}

      {/* ── Description ────────────────────────────── */}
  <p className="text-xs sm:text-sm text-white/70 mb-3 line-clamp-2">{f.description}</p>

      {/* ── Key metrics ────────────────────────────── */}
  <div className="flex flex-wrap justify-between text-white/70 text-xs sm:text-sm mb-4 gap-1">
        <span className="whitespace-nowrap">
          <b>{formatSol(f.tvl)}</b>&nbsp;SOL&nbsp;TVL
        </span>
        <span className="whitespace-nowrap">
          Performance fee&nbsp;<b>{f.perfFee}%</b>
        </span>
        <span className="whitespace-nowrap">
          <b>{f.investorCount}</b>&nbsp;Investors
        </span>
      </div>

      {/* ── Invest action ─────────────────────────── */}
      <div className="space-y-2">
        {f.inviteOnly && (
          <div className="text-[11px] font-medium text-brand-yellow/90 bg-brand-yellow/10 border border-brand-yellow/30 px-3 py-1.5 rounded-md text-center">
            Invite code required
          </div>
        )}
        <button
          onClick={invest}
          className="w-full bg-brand-yellow text-brand-black font-semibold py-2.5 rounded-full hover:brightness-110 active:scale-[.99] transition text-sm"
        >
          Invest
        </button>
      </div>

      {/* ── Toggle details ─────────────────────────── */}
      <button
        onClick={() => setDetails(!details)}
        className="mt-3 text-white/60 hover:text-white hover:underline text-xs w-full text-left transition"
      >
        {details ? 'Hide info' : 'More info'}
      </button>

      {/* ── Expanded stats ────────────────────────── */}
      {details && (
        <div className="mt-4">
          {/* PnL Performance graph */}
          <h4 className="text-white text-sm font-semibold mb-2">P&L Performance</h4>
          <div className="h-32 sm:h-40 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <Line
                  type="monotone"
                  dataKey="pnl"
                  stroke="var(--color-brand-yellow)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, stroke: 'var(--color-brand-yellow)', strokeWidth: 2 }}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip 
                  formatter={(value: number) => [`${Number(value).toFixed(2)} SOL`, 'P&L']}
                  labelFormatter={() => 'Performance'}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats grid */}
          <ul className="text-white/70 text-xs grid grid-cols-1 sm:grid-cols-2 gap-y-1 mt-3">
            <li>
              Total trades&nbsp;<b>{f.stats.total}</b>
            </li>
            <li>
              Win / loss&nbsp;<b>{f.stats.wins}/{f.stats.losses}</b>
            </li>
            <li className="col-span-1 sm:col-span-2">
              Avg win&nbsp;
              <b>
                {f.stats.avgWinPct}% ({f.stats.avgWinSol} SOL)
              </b>
            </li>
            <li className="col-span-1 sm:col-span-2">
              Avg loss&nbsp;
              <b>
                {f.stats.avgLossPct}% ({f.stats.avgLossSol} SOL)
              </b>
            </li>
            <li className="col-span-1 sm:col-span-2">
              Max draw-down&nbsp;
              <b>
                {f.stats.drawdownPct}% ({f.stats.drawdownSol} SOL)
              </b>
            </li>
          </ul>

          {/* Top edges */}
          <h4 className="mt-3 text-white text-sm font-semibold">Top wins</h4>
          <ul className="text-white/70 text-xs space-y-0.5">
            {f.stats.topWins.map((w) => (
              <li key={w.token} className="flex justify-between">
                <span>{w.token}</span>
                <span>
                  <b>
                    {w.pct}% ({w.sol} SOL)
                  </b>
                </span>
              </li>
            ))}
          </ul>

          <h4 className="mt-3 text-white text-sm font-semibold">Top losses</h4>
          <ul className="text-white/70 text-xs space-y-0.5">
            {f.stats.topLosses.map((l) => (
              <li key={l.token} className="flex justify-between">
                <span>{l.token}</span>
                <span>
                  <b>
                    {l.pct}% ({l.sol} SOL)
                  </b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Investment Modal */}
      <InvestInFundModal
        isOpen={showInvestModal}
        onClose={() => setShowInvestModal(false)}
        fundId={f.id}
        fundName={f.name}
        isRwa={f.type === 'Construction' || f.type === 'Advance Receivable'}
        requiresInviteCode={f.inviteOnly}
        accessMode={f.accessMode}
        onInvestmentComplete={handleInvestmentComplete}
      />
    </div>
  );
}
