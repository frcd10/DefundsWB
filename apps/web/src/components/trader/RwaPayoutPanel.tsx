'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { sendBatchedSolPayments } from '@/lib/rwa-payments';
import { SolscanLink } from '@/components/SolscanLink';

type RwaDoc = {
  _id: string;
  fundId: string;
  name: string;
  currentValue?: number;
  totalShares?: number;
  investments?: Array<{ walletAddress: string; shares: number }>;
  payments?: Array<{ timestamp: string | Date; totalValue: number; signature: string; recipients: Array<{ wallet: string; amountSol: number }> }>;
};


export function RwaPayoutPanel({ rwas, managerWallet }: { rwas: Array<Partial<RwaDoc> & Record<string, unknown>>; managerWallet: string }) {
  const wallet = useWallet();
  const [selectedId, setSelectedId] = useState<string>((rwas[0]?.fundId as string) || '');
  const [addValue, setAddValue] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [localPayments, setLocalPayments] = useState<RwaDoc['payments']>([]);

  const selected = useMemo(() => rwas.find(r => r.fundId === selectedId), [rwas, selectedId]);

  useEffect(() => {
    setLocalPayments((selected?.payments as RwaDoc['payments']) || []);
  }, [selectedId, selected?.payments]);

  const handleAddAndPay = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
  const value = parseFloat(addValue.replace(/,/g, '.') || '0');
      const res = await fetch('/api/rwa/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: selectedId, manager: managerWallet, addValue: value })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Payout failed');
      if (data.data?.payments) {
        setMessage(`Executed ${data.data.payments.length} tx(s)`);
        // Update local payments history; ensure timestamp exists client-side for display
        const nowIso = new Date().toISOString();
        setLocalPayments((prev) => ([
          ...(prev || []),
          ...((data.data.payments as Array<{ timestamp?: string | Date; totalValue: number; signature: string; recipients: Array<{ wallet: string; amountSol: number | string }> }>)).map((p) => ({
            timestamp: p.timestamp ?? nowIso,
            signature: p.signature,
            totalValue: p.totalValue,
            recipients: p.recipients.map(r => ({ wallet: r.wallet, amountSol: typeof r.amountSol === 'number' ? r.amountSol : parseFloat(r.amountSol.toString()) }))
          }))
        ]));
      } else if (data.data?.plan) {
        // Client-side signing path
        const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const payments = await sendBatchedSolPayments(wallet, data.data.plan, rpc);
        // Save to server
        const save = await fetch('/api/rwa/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fundId: selectedId, manager: managerWallet, addValue: value, payments }),
        });
        const saved = await save.json();
        if (!saved.success) throw new Error(saved.error || 'Failed to record payments');
        setMessage(`Executed ${payments.length} tx(s)`);
        const nowIso = new Date().toISOString();
        setLocalPayments((prev) => ([
          ...(prev || []),
          ...payments.map((p) => ({
            timestamp: nowIso,
            signature: p.signature,
            totalValue: p.totalValue,
            recipients: p.recipients.map(r => ({ wallet: r.wallet, amountSol: typeof r.amountSol === 'number' ? r.amountSol : parseFloat(r.amountSol.toString()) }))
          }))
        ]));
      } else {
        setMessage('Payout processed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payout failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-white/70">RWA Product</label>
          <select className="input w-full appearance-none pr-8" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {rwas.map((r, idx) => (
              <option key={(r._id as string) || `rwa-${idx}`} value={r.fundId as string}>{(r.name as string) || r.fundId}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-white/70">Add Value (SOL)</label>
          <Input
            value={addValue}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, '.');
              if (/^\d*(?:\.\d*)?$/.test(raw) || raw === '') setAddValue(raw);
            }}
            placeholder="0.5"
            className="input w-full"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleAddAndPay}
            disabled={loading}
            className="w-full rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition"
          >
            {loading ? 'Processing...' : 'Pay Investors'}
          </Button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {message && <div className="text-green-400 text-sm">{message}</div>}

      {selected && (
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Investors</h3>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowHistory(true)} className="rounded-full bg-white/10 hover:bg-white/15 text-white/70 border border-white/10">Payments History</Button>
              <span className="text-xs text-white/50">Total Shares: {Math.max(0, (selected.totalShares as number) || 0)}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-brand-surface">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Wallet</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Shares</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Ownership</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(selected.investments || []).map((inv) => {
                  const shares = Math.max(0, inv.shares || 0);
                  const total = Math.max(0, (selected.investments || []).reduce((s: number, i: any) => s + Math.max(0, i.shares || 0), 0));
                  const pct = total > 0 ? Math.min(100, (100 * shares) / total) : 0;
                  return (
                    <tr key={inv.walletAddress} className="hover:bg-brand-yellow/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{inv.walletAddress.slice(0, 4)}...{inv.walletAddress.slice(-4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{shares.toFixed(4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transparent payments modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowHistory(false)} />
          <div className="relative z-10 w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-brand-surface/95 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Payments History</h3>
              <Button onClick={() => setShowHistory(false)} className="rounded-full bg-white/10 hover:bg-white/15 text-white/70 border border-white/10 px-3 py-1 text-sm">Close</Button>
            </div>
            <div className="p-5 overflow-auto max-h-[70vh] space-y-5">
              {(!localPayments || localPayments.length === 0) && (
                <div className="text-sm text-white/50">No payments yet.</div>
              )}
              {(localPayments || []).slice().reverse().map((p, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-white/5">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
                    <div className="text-sm text-white/60">
                      <div>Date: <span className="text-white">{new Date(p.timestamp as string).toLocaleString()}</span></div>
                      <div>Total: <span className="text-emerald-400">{p.totalValue.toFixed(4)} SOL</span></div>
                    </div>
                    <div className="text-sm">
                      <SolscanLink signature={p.signature} cluster="devnet" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-brand-surface">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-white/60 tracking-wide">Wallet</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-white/60 tracking-wide">% of payout</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-white/60 tracking-wide">Amount (SOL)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {p.recipients.map((r) => {
                          const pct = p.totalValue > 0 ? (r.amountSol / p.totalValue) * 100 : 0;
                          return (
                            <tr key={`${p.signature}-${r.wallet}`} className="hover:bg-brand-yellow/5 transition">
                              <td className="px-4 py-2 text-sm text-white">{r.wallet.slice(0, 4)}...{r.wallet.slice(-4)}</td>
                              <td className="px-4 py-2 text-sm text-white">{pct.toFixed(2)}%</td>
                              <td className="px-4 py-2 text-sm text-emerald-400">{r.amountSol.toFixed(6)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
