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
      const value = parseFloat(addValue || '0');
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
          ...((data.data.payments as Array<{ timestamp?: string | Date; totalValue: number; signature: string; recipients: Array<{ wallet: string; amountSol: number }> }>)).map((p) => ({
            timestamp: p.timestamp ?? nowIso,
            signature: p.signature,
            totalValue: p.totalValue,
            recipients: p.recipients,
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
          ...payments.map((p) => ({ timestamp: nowIso, signature: p.signature, totalValue: p.totalValue, recipients: p.recipients }))
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
          <label className="text-sm text-sol-200">RWA Product</label>
          <select className="w-full bg-sol-800 border border-sol-700 rounded px-3 py-2 text-white" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {rwas.map((r, idx) => (
              <option key={(r._id as string) || `rwa-${idx}`} value={r.fundId as string}>{(r.name as string) || r.fundId}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-sol-200">Add Value (SOL)</label>
          <Input value={addValue} onChange={(e) => setAddValue(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleAddAndPay}
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:brightness-110 transition"
          >
            {loading ? 'Processing...' : 'Pay Investors'}
          </Button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {message && <div className="text-green-400 text-sm">{message}</div>}

      {selected && (
        <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 overflow-hidden">
          <div className="p-4 border-b border-sol-700 flex items-center justify-between">
            <h3 className="text-lg font-bold text-sol-50">Investors</h3>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowHistory(true)} className="rounded-xl bg-sol-900/60 border border-sol-700 text-sol-200 hover:bg-sol-900/80">Payments History</Button>
              <span className="text-xs text-sol-300">Total Shares: {selected.totalShares || 0}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sol-800/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Wallet</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Shares</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Ownership</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-700">
                {(selected.investments || []).map((inv) => {
                  const pct = selected.totalShares && selected.totalShares > 0 ? (100 * (inv.shares || 0)) / (selected.totalShares || 1) : 0;
                  return (
                    <tr key={inv.walletAddress} className="hover:bg-sol-800/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{inv.walletAddress.slice(0, 4)}...{inv.walletAddress.slice(-4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{(inv.shares || 0).toFixed(4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{pct.toFixed(2)}%</td>
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
          <div className="relative z-10 w-[95vw] max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl border border-sol-700 bg-sol-800/70 backdrop-blur-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-sol-700">
              <h3 className="text-lg font-bold text-sol-50">Payments History</h3>
              <Button onClick={() => setShowHistory(false)} className="rounded-full bg-sol-900/60 border border-sol-700 text-sol-200 hover:bg-sol-900/80 px-3 py-1 text-sm">Close</Button>
            </div>
            <div className="p-5 overflow-auto max-h-[70vh] space-y-5">
              {(!localPayments || localPayments.length === 0) && (
                <div className="text-sm text-sol-300">No payments yet.</div>
              )}
              {(localPayments || []).slice().reverse().map((p, idx) => (
                <div key={idx} className="rounded-xl border border-sol-700 bg-sol-900/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-sol-700">
                    <div className="text-sm text-sol-200">
                      <div>Date: <span className="text-sol-50">{new Date(p.timestamp as string).toLocaleString()}</span></div>
                      <div>Total: <span className="text-green-400">{p.totalValue.toFixed(4)} SOL</span></div>
                    </div>
                    <div className="text-sm">
                      <SolscanLink signature={p.signature} cluster="devnet" />
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-sol-800/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Wallet</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">% of payout</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Amount (SOL)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sol-700">
                        {p.recipients.map((r) => {
                          const pct = p.totalValue > 0 ? (r.amountSol / p.totalValue) * 100 : 0;
                          return (
                            <tr key={`${p.signature}-${r.wallet}`} className="hover:bg-sol-800/40">
                              <td className="px-4 py-2 text-sm text-sol-50">{r.wallet.slice(0, 4)}...{r.wallet.slice(-4)}</td>
                              <td className="px-4 py-2 text-sm text-sol-50">{pct.toFixed(2)}%</td>
                              <td className="px-4 py-2 text-sm text-green-400">{r.amountSol.toFixed(6)}</td>
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
