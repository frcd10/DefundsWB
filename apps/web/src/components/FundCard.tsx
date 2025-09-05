'use client';
import { Fund } from '@/data/mockFunds';
import { useState } from 'react';
import { InvestInFundModal } from './InvestInFundModal';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function FundCard({ f }: { f: Fund }) {
  const [details, setDetails] = useState(false);
  const [invite, setInvite] = useState('');
  const [showInvestModal, setShowInvestModal] = useState(false);

  const invest = () => {
    if (f.inviteOnly && !invite.trim()) {
      return alert('Invite code required');
    }
    
    // Open the investment modal
    setShowInvestModal(true);
    console.log('Opening investment modal for fund:', f.id);
  };

  const handleInvestmentComplete = (signature: string) => {
    console.log('Investment completed with signature:', signature);
    // TODO: Refresh fund data or show success message
    alert(`Investment successful! Transaction: ${signature.slice(0, 8)}...${signature.slice(-8)}`);
  };

  return (
    <div className="rounded-2xl p-4 sm:p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-base sm:text-lg font-bold text-sol-50 leading-tight pr-2">{f.name}</h3>
        <span className="px-2 py-1 rounded-lg bg-sol-accent text-sol-900 text-xs whitespace-nowrap">
          {f.type}
        </span>
      </div>

      {/* ── Description ────────────────────────────── */}
      <p className="text-xs sm:text-sm text-sol-200 mb-3 line-clamp-2">{f.description}</p>

      {/* ── Key metrics ────────────────────────────── */}
      <div className="flex flex-wrap justify-between text-sol-100 text-xs sm:text-sm mb-4 gap-1">
        <span className="whitespace-nowrap">
          <b>{f.tvl}</b>&nbsp;SOL&nbsp;TVL
        </span>
        <span className="whitespace-nowrap">
          Perf&nbsp;<b>{f.perfFee}%</b>
        </span>
        <span className="whitespace-nowrap">
          <b>{f.investorCount}</b>&nbsp;Investors
        </span>
      </div>

      {/* ── Invest action ─────────────────────────── */}
      <div className="space-y-2">
        {f.inviteOnly && (
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="Invite code"
            className="input w-full text-sm"
          />
        )}

        <button
          onClick={invest}
          className="w-full bg-sol-accent text-sol-900 font-bold py-2 rounded-xl hover:scale-105 transition text-sm"
        >
          Invest
        </button>
      </div>

      {/* ── Toggle details ─────────────────────────── */}
      <button
        onClick={() => setDetails(!details)}
        className="mt-3 text-sol-200 text-xs hover:underline w-full text-left"
      >
        {details ? 'Hide info' : 'More info'}
      </button>

      {/* ── Expanded stats ────────────────────────── */}
      {details && (
        <div className="mt-4">
          {/* Evolution graph */}
          <div className="h-32 sm:h-40 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={f.performance}>
                <Line
                  type="monotone"
                  dataKey="nav"
                  stroke="#44FFB3"
                  strokeWidth={2}
                  dot={false}
                />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Tooltip />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Stats grid */}
          <ul className="text-sol-100 text-xs grid grid-cols-1 sm:grid-cols-2 gap-y-1 mt-3">
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
          <h4 className="mt-3 text-sol-50 text-sm font-semibold">Top wins</h4>
          <ul className="text-sol-100 text-xs space-y-0.5">
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

          <h4 className="mt-3 text-sol-50 text-sm font-semibold">Top losses</h4>
          <ul className="text-sol-100 text-xs space-y-0.5">
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
        onInvestmentComplete={handleInvestmentComplete}
      />
    </div>
  );
}
