'use client';
import { Fund } from '@/data/mockFunds';
import { useState } from 'react';
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

  const invest = () => {
    if (f.inviteOnly && !invite.trim()) {
      return alert('Invite code required');
    }
    // TODO: trigger on-chain deposit
    console.log('investing →', f.id, 'invite=', invite);
  };

  return (
    <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-bold text-sol-50">{f.name}</h3>
        <span className="px-2 py-1 rounded-lg bg-sol-accent text-sol-900 text-xs">
          {f.type}
        </span>
      </div>

      {/* ── Description ────────────────────────────── */}
      <p className="text-sm text-sol-200 mb-3 line-clamp-2">{f.description}</p>

      {/* ── Key metrics ────────────────────────────── */}
      <div className="flex justify-between text-sol-100 text-sm mb-4">
        <span>
          <b>{f.tvl}</b>&nbsp;SOL&nbsp;TVL
        </span>
        <span>
          Perf&nbsp;<b>{f.perfFee}%</b>
        </span>
        <span>
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
            className="input w-full"
          />
        )}

        <button
          onClick={invest}
          className="w-full bg-sol-accent text-sol-900 font-bold py-2 rounded-xl hover:scale-105 transition"
        >
          Invest
        </button>
      </div>

      {/* ── Toggle details ─────────────────────────── */}
      <button
        onClick={() => setDetails(!details)}
        className="mt-3 text-sol-200 text-xs hover:underline"
      >
        {details ? 'Hide info' : 'More info'}
      </button>

      {/* ── Expanded stats ────────────────────────── */}
      {details && (
        <div className="mt-4">
          {/* Evolution graph */}
          <ResponsiveContainer width="100%" height={160}>
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

          {/* Stats grid */}
          <ul className="text-sol-100 text-xs grid grid-cols-2 gap-y-1 mt-3">
            <li>
              Total trades&nbsp;<b>{f.stats.total}</b>
            </li>
            <li>
              Win / loss&nbsp;<b>{f.stats.wins}/{f.stats.losses}</b>
            </li>
            <li>
              Avg win&nbsp;
              <b>
                {f.stats.avgWinPct}% ({f.stats.avgWinSol} SOL)
              </b>
            </li>
            <li>
              Avg loss&nbsp;
              <b>
                {f.stats.avgLossPct}% ({f.stats.avgLossSol} SOL)
              </b>
            </li>
            <li>
              Max draw-down&nbsp;
              <b>
                {f.stats.drawdownPct}% ({f.stats.drawdownSol} SOL)
              </b>
            </li>
          </ul>

          {/* Top edges */}
          <h4 className="mt-3 text-sol-50 text-sm font-semibold">Top wins</h4>
          <ul className="text-sol-100 text-xs">
            {f.stats.topWins.map((w) => (
              <li key={w.token}>
                {w.token}&nbsp;
                <b>
                  {w.pct}% ({w.sol} SOL)
                </b>
              </li>
            ))}
          </ul>

          <h4 className="mt-3 text-sol-50 text-sm font-semibold">Top losses</h4>
          <ul className="text-sol-100 text-xs">
            {f.stats.topLosses.map((l) => (
              <li key={l.token}>
                {l.token}&nbsp;
                <b>
                  {l.pct}% ({l.sol} SOL)
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
