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
  const [copied, setCopied] = useState(false);

  // Transform performance data to use percentage relative change from first point
  const performanceData = f.performance.map((point) => {
    // Prefer explicit pnlPercentage if already present
    if ('pnlPercentage' in point && point.pnlPercentage !== undefined) {
      return point as any;
    }
    const initialNav = f.performance[0]?.nav || 10;
    const pnlPercentage = initialNav !== 0 ? ((point.nav - initialNav) / initialNav) * 100 : 0;
    return { ...point, pnlPercentage } as any;
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

  const fundAddress = String(f.fundId || f.id);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(fundAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="rounded-2xl p-4 sm:p-6 bg-white/5 backdrop-blur-sm border border-white/10">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start mb-1 gap-2">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-bold text-white leading-tight pr-2 truncate">{f.name}</h3>
          <div className="text-[11px] text-white/50 flex items-center gap-2">
            <span className="truncate">{fundAddress.slice(0, 8)}...{fundAddress.slice(-6)}</span>
            <button onClick={copyAddr} className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
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
      <div className="grid grid-cols-2 gap-2 text-white/80 text-xs sm:text-sm mb-4">
        <div className="bg-white/5 rounded-md p-2">
          <div className="text-white/60">Current Value</div>
          <div className="font-semibold">{formatSol(f.currentValue ?? f.tvl)} SOL</div>
        </div>
        <div className="bg-white/5 rounded-md p-2">
          <div className="text-white/60">Invested</div>
          <div className="font-semibold">{formatSol(f.invested ?? 0)} SOL</div>
        </div>
        <div className="bg-white/5 rounded-md p-2">
          <div className="text-white/60">Withdrawn</div>
          <div className="font-semibold text-orange-300">{formatSol(f.withdrawn ?? 0)} SOL</div>
        </div>
        <div className="bg-white/5 rounded-md p-2">
          <div className="text-white/60">P&L</div>
          <div className={`font-semibold ${((f.pnlSol ?? 0) >= 0) ? 'text-emerald-300' : 'text-red-300'}`}>
            {(f.pnlSol ?? 0) >= 0 ? '+' : ''}{formatSol(f.pnlSol ?? 0)} SOL
            <span className="ml-1 text-white/60">({(f.pnlPct ?? 0).toFixed(2)}%)</span>
          </div>
        </div>
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
          <div className="h-32 sm:h-40 mb-3 bg-brand-surface/80 border border-white/10 rounded-xl p-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData} margin={{ top: 0, right: -1, bottom: 0, left: 0 }}>
                <Line
                  type="monotone"
                  dataKey="pnlPercentage"
                  stroke="var(--color-brand-yellow)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: '#ffffff', strokeWidth: 2, fill: '#ffffff' }}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip 
                  formatter={(value: number) => [`${Number(value).toFixed(2)}%`, 'P&L %']}
                  labelFormatter={() => 'Performance'}
                  contentStyle={{ background: 'rgba(20,20,20,0.9)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Removed legacy stats and top wins/losses per request */}
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
