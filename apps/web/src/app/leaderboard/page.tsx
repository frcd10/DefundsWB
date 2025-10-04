"use client";
import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';

type Row = { address: string; invitedUsers: number; totalInvested: number; points: number };

type SortKey = 'address' | 'invitedUsers' | 'totalInvested' | 'points';
type SortDir = 'asc' | 'desc';

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expectedDistribution, setExpectedDistribution] = useState<number | null>(null);
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchBoard() {
      try {
        const res = await fetch('/api/leaderboard?limit=100', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.success) setRows(json.data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    async function fetchTreasury() {
      try {
        const res = await fetch('/api/treasury', { cache: 'no-store' });
        const json = await res.json();
        if (json?.success && json.data) {
          setTreasuryAddress(json.data.address || null);
          setExpectedDistribution(typeof json.data.expectedDistributionSol === 'number' ? json.data.expectedDistributionSol : null);
        }
      } catch {
        // ignore
      }
    }
    fetchBoard();
    fetchTreasury();
    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function onHeaderClick(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'address' ? 'asc' : 'desc'); }
  }

  return (
    <main className="min-h-screen bg-brand-black text-white">
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-yellow-500/20 text-yellow-300"><Trophy size={24} /></div>
            <h1 className="text-3xl font-extrabold">Leaderboard</h1>
          </div>
          <div className="text-right text-sm text-white/80">
            {expectedDistribution != null ? (
              <div>
                <div className="font-semibold">Expected distribution (80% of treasury)</div>
                <div className="text-white">{expectedDistribution.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</div>
                {treasuryAddress && <div className="text-white/60 text-xs mt-1 truncate max-w-[280px]">Treasury: {treasuryAddress}</div>}
              </div>
            ) : (
              <div className="text-white/60">Expected distribution unavailable</div>
            )}
          </div>
        </div>
        <div className="mb-4 text-white/80 text-sm leading-relaxed">
          <div>Points update hourly with: <span className="text-white">Existing points + (Total invested × (Invited users / 5))</span></div>
          <div>If invited users is smaller than 5, the multiplier is 1.</div>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          {loading ? (
            <div className="p-6 text-white/70">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-white/60">
                  <tr>
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('address')}>Address {sortKey==='address' && (sortDir==='asc'?'▲':'▼')}</th>
                    <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('invitedUsers')}>Invited Users {sortKey==='invitedUsers' && (sortDir==='asc'?'▲':'▼')}</th>
                    <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('totalInvested')}>Total Invested {sortKey==='totalInvested' && (sortDir==='asc'?'▲':'▼')}</th>
                    <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('points')}>Total Points {sortKey==='points' && (sortDir==='asc'?'▲':'▼')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td className="py-6 text-center text-white/60" colSpan={5}>No data yet</td></tr>
                  )}
                  {sorted.map((r, idx) => (
                    <tr key={r.address} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-white/80">{idx + 1}</td>
                      <td className="py-2 pr-4 text-white truncate max-w-[280px]">{r.address}</td>
                      <td className="py-2 pr-4 text-white/80">{r.invitedUsers}</td>
                      <td className="py-2 pr-4 text-white/80">{r.totalInvested.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                      <td className="py-2 pr-4 text-brand-yellow font-semibold">{r.points.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
