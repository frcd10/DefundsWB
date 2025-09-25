'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaFundService } from '@/services/solana-fund.service';
import { SolscanLink } from '@/components/SolscanLink';

type FundDoc = {
  _id: string;
  fundId: string;
  name: string;
  totalShares?: number;
  investments?: Array<{ walletAddress: string; shares: number }>;
  payments?: Array<{ timestamp: string | Date; totalValue: number; signature: string; recipients: Array<{ wallet: string; amountSol: number }> }>;
  performanceFee?: number;
};

export function FundPayoutPanel({ funds, managerWallet }: { funds: Array<Partial<FundDoc> & Record<string, unknown>>; managerWallet: string }) {
  const wallet = useWallet();
  const [selectedId, setSelectedId] = useState<string>((funds[0]?.fundId as string) || '');
  const [payoutValue, setPayoutValue] = useState<string>('0');
  const [loading, setLoading] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [localPayments, setLocalPayments] = useState<FundDoc['payments']>([]);

  const selected = useMemo(() => funds.find(f => f.fundId === selectedId), [funds, selectedId]);

  useEffect(() => {
    setLocalPayments((selected?.payments as FundDoc['payments']) || []);
  }, [selectedId, selected?.payments]);

  const handlePayout = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!wallet.connected || !wallet.publicKey) throw new Error('Connect wallet');
      const value = parseFloat(payoutValue || '0');
      if (!selected || !selected.fundId) throw new Error('Select a fund');
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive payout');

      const investorWallets = ((selected.investments || []) as Array<{ walletAddress: string }>).map((i) => i.walletAddress);
      if (investorWallets.length === 0) throw new Error('No investors to pay');

      // Execute on-chain payout via program
      const signature = await solanaFundService.payFundInvestors(wallet, selected.fundId as string, value, investorWallets);

      // Compute recipients locally for history (pro-rata by shares) using NET investor pool after fees
      // On-chain: base 1% from total, then performance fee on remaining; treasury gets 20% of perf, manager 80%; investors get the remainder.
      const perfRaw = Number((selected as any).performanceFee ?? 0); // may be in % or bps
      const perfBps = perfRaw > 100 ? perfRaw : Math.round(perfRaw * 100);
      const investorPoolSol = value * 0.99 * (1 - Math.max(0, Math.min(10000, perfBps)) / 10000);
      const computedTotal = (selected.investments as any[])?.reduce((s, i) => s + Math.max(0, i.shares || 0), 0) || 0;
      const totalShares = Math.max(0, (selected.totalShares as number) ?? computedTotal);
      const recipients = (selected.investments as Array<{ walletAddress: string; shares: number }>)
        .map((inv) => {
          const portion = totalShares > 0 ? (Math.max(0, inv.shares || 0) / totalShares) : 0;
          return { wallet: inv.walletAddress, amountSol: investorPoolSol * portion };
        })
        .filter(r => r.amountSol > 0);

      // Save to server for history
      const save = await fetch('/api/funds/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: selected.fundId, manager: managerWallet, amount: value, signature, recipients }),
      });
      const saved = await save.json();
      if (!saved.success) throw new Error(saved.error || 'Failed to record payout');

      setMessage('Payout executed');
      const nowIso = new Date().toISOString();
      setLocalPayments((prev) => ([
        ...(prev || []),
        { timestamp: nowIso, signature, totalValue: value, recipients },
      ]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payout failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDevnetTopUp = async () => {
    setError(null);
    setMessage(null);
    try {
      if (!selected?.fundId) throw new Error('Select a fund');
      setToppingUp(true);
      const sig = await solanaFundService.devnetTopUpVaultSol(selected.fundId as string, 0.5);
      setMessage(`Devnet airdrop sent to vault. Signature: ${sig}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Top up failed');
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-sol-200">Fund</label>
          <select className="w-full bg-sol-800 border border-sol-700 rounded px-3 py-2 text-white" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {funds.map((f, idx) => (
              <option key={(f._id as string) || `fund-${idx}`} value={f.fundId as string}>{(f.name as string) || f.fundId as string}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-sol-200">Payout Amount (SOL)</label>
          <Input value={payoutValue} onChange={(e) => setPayoutValue(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={handlePayout} disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:brightness-110 transition">
            {loading ? 'Processing…' : 'Pay Investors'}
          </Button>
          <Button onClick={handleDevnetTopUp} disabled={toppingUp} className="rounded-xl bg-sol-900/60 border border-sol-700 text-sol-200 hover:bg-sol-900/80 whitespace-nowrap">
            {toppingUp ? 'Airdropping…' : 'Devnet top-up'}
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
              <span className="text-xs text-sol-300">Total Shares: {Math.max(0, (selected.totalShares as number) || 0)}</span>
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
                {(selected.investments || []).map((inv: any) => {
                  const shares = Math.max(0, inv.shares || 0);
                  const total = Math.max(0, (selected.investments || []).reduce((s: number, i: any) => s + Math.max(0, i.shares || 0), 0));
                  const pct = total > 0 ? Math.min(100, (100 * shares) / total) : 0;
                  return (
                    <tr key={inv.walletAddress} className="hover:bg-sol-800/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{inv.walletAddress.slice(0, 4)}...{inv.walletAddress.slice(-4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{shares.toFixed(4)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{pct.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
