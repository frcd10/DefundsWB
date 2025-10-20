"use client";
import { useEffect, useMemo, useState } from 'react';
import { Trophy, Copy } from 'lucide-react';

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
  const [view, setView] = useState<'live'|'snapshot'>('live');

  useEffect(() => {
    let cancelled = false;
    async function fetchBoard() {
      try {
        const url = view === 'snapshot' ? '/api/leaderboard?snapshot=devnet_snapshot&limit=100' : '/api/leaderboard?limit=100';
        const res = await fetch(url, { cache: 'no-store' });
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
  }, [view]);

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

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  // no manual refresh button (removed);

  return (
    <main className="min-h-screen bg-brand-black text-white">
      <section className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-yellow-500/20 text-yellow-300"><Trophy size={24} /></div>
              <div>
                <h1 className="text-3xl font-extrabold">Leaderboard</h1>
                <p className="text-white/60 text-sm">{view==='snapshot' ? 'Static snapshot. Rewards from 80% of treasury.' : 'Updated hourly. Rewards from 80% of treasury.'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center bg-white/10 border border-white/10 rounded-lg overflow-hidden">
                <button onClick={() => setView('live')} className={`px-3 py-2 text-sm transition ${view==='live' ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/15'}`}>Live</button>
                <button onClick={() => setView('snapshot')} className={`px-3 py-2 text-sm transition ${view==='snapshot' ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/15'}`}>Snapshot 1</button>
              </div>
              <div className="text-right text-sm text-white/80">
                {expectedDistribution != null ? (
                  <div>
                    <div className="font-semibold">Expected distribution (80% of treasury)</div>
                    <div className="text-white">{expectedDistribution.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</div>
                    {treasuryAddress && (
                      <div className="text-white/60 text-xs mt-1 max-w-[320px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">Treasury: {treasuryAddress}</span>
                          <button
                            onClick={() => copy(treasuryAddress)}
                            title="Copy treasury address"
                            className="shrink-0 text-white/50 hover:text-white/80"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-white/60">Expected distribution unavailable</div>
                )}
              </div>
            </div>
          </div>

          {/* Formula card */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-4">
            <div className="text-white/80 text-sm">Points each hour = <span className="text-white font-medium">Existing points + (Total invested × (Invited users / 5))</span>. If invited users &lt; 5, multiplier is 1.</div>
          </div>

          {/* Top 3 podium */}
          {!loading && sorted.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {sorted.slice(0, 3).map((r, i) => (
                <div key={r.address} className={`rounded-2xl border p-5 ${i===0?'bg-yellow-500/10 border-yellow-500/30':'bg-white/5 border-white/10'}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-white/70 text-sm">{i===0?'1st':i===1?'2nd':'3rd'}</div>
                    <div className="text-white/40 text-xs">{r.points.toLocaleString(undefined,{maximumFractionDigits:2})} pts</div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate max-w-[180px]">{r.address}</div>
                        <button onClick={() => copy(r.address)} className="text-white/50 hover:text-white/80"><Copy size={14} /></button>
                      </div>
                      <div className="text-xs text-white/60">Invited {r.invitedUsers} • Invested {r.totalInvested.toLocaleString(undefined,{maximumFractionDigits:2})} SOL</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Table card */}
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
                      <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('invitedUsers')}>Invited {sortKey==='invitedUsers' && (sortDir==='asc'?'▲':'▼')}</th>
                      <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('totalInvested')}>Invested (SOL) {sortKey==='totalInvested' && (sortDir==='asc'?'▲':'▼')}</th>
                      <th className="py-2 pr-4 cursor-pointer select-none" onClick={() => onHeaderClick('points')}>Points {sortKey==='points' && (sortDir==='asc'?'▲':'▼')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td className="py-6 text-center text-white/60" colSpan={5}>No data yet</td></tr>
                    )}
                    {sorted.map((r, idx) => {
                      const maxPts = sorted[0]?.points || 1;
                      const pct = Math.max(0, Math.min(100, (r.points / maxPts) * 100));
                      return (
                        <tr key={r.address} className="border-t border-white/5 align-top">
                          <td className="py-3 pr-4 text-white/80">{idx + 1}</td>
                          <td className="py-3 pr-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate max-w-[220px]">{r.address}</div>
                                <button onClick={() => copy(r.address)} className="text-white/50 hover:text-white/80"><Copy size={14} /></button>
                              </div>
                              <div className="mt-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-400/80" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-white/80">{r.invitedUsers}</td>
                          <td className="py-3 pr-4 text-white/80">{r.totalInvested.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                          <td className="py-3 pr-4 text-brand-yellow font-semibold">{r.points.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
