"use client";
import { useEffect, useState } from 'react';

export type LeaderboardRow = {
  address: string;
  invitedUsers: number;
  totalInvested: number;
  points: number;
};

export default function LeaderboardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchBoard() {
      setLoading(true);
      try {
        const res = await fetch('/api/leaderboard?limit=50', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json?.success) setRows(json.data || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (open) fetchBoard();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70">
      <div className="w-full max-w-3xl rounded-2xl bg-[#111] border border-white/10 shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-lg font-semibold">Leaderboard</h3>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white text-sm">Close</button>
        </div>

        {loading ? (
          <div className="text-white/70">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="text-white/60">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Invited Users</th>
                  <th className="py-2 pr-4">Total Invested</th>
                  <th className="py-2 pr-4">Total Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/60">No data yet</td>
                  </tr>
                )}
                {rows.map((r, idx) => (
                  <tr key={r.address} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-white/80">{idx + 1}</td>
                    <td className="py-2 pr-4 text-white truncate max-w-[180px]">{r.address}</td>
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
    </div>
  );
}
