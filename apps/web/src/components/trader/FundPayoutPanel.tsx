'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWallet } from '@solana/wallet-adapter-react';
import { solanaFundServiceModular as solanaFundService } from '@/services/solanaFund';
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
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [localPayments, setLocalPayments] = useState<FundDoc['payments']>([]);
  const [submitted, setSubmitted] = useState(false);
  const [selectedLocal, setSelectedLocal] = useState<Record<string, unknown> | null>(null);
  const [treasury, setTreasury] = useState<string | null>(null);

  const selected = useMemo(() => funds.find(f => f.fundId === selectedId), [funds, selectedId]);

  useEffect(() => {
    // Prefer refreshed local copy if present, otherwise fall back to selected from props
    const basePayments = (selectedLocal?.payments as FundDoc['payments'])
      || (selected?.payments as FundDoc['payments'])
      || [];
    setLocalPayments(basePayments);
    setSelectedLocal(selected as Record<string, unknown> | null);
  }, [selectedId, selected?.payments]);

  // On first render, fetch treasury if not present
  useEffect(() => {
    const fetchTreasury = async () => {
      try {
        if (!wallet.publicKey) return;
        const refRes = await fetch(`/api/trader/eligible?wallet=${wallet.publicKey.toString()}`, { cache: 'no-store' });
        const refJson = await refRes.json();
        if (refJson?.success && typeof refJson.data?.treasury === 'string') {
          setTreasury(refJson.data.treasury);
        }
      } catch {}
    };
    if (!treasury) fetchTreasury();
  }, [treasury, wallet.publicKey]);

  const handlePayout = async () => {
    if (submitted) return; // guard double submit
    setSubmitted(true);
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (!wallet.connected || !wallet.publicKey) throw new Error('Connect wallet');
  const value = parseFloat(payoutValue.replace(/,/g, '.') || '0');
      if (!selected || !selected.fundId) throw new Error('Select a fund');
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a positive payout');

      const investorWallets = ((selected.investments || []) as Array<{ walletAddress: string }>).map((i) => i.walletAddress);
      if (investorWallets.length === 0) throw new Error('No investors to pay');

      // Execute on-chain payout via program
  const signature = await solanaFundService.payFundInvestors(wallet, selected.fundId as string, value, investorWallets, treasury || undefined);

      // Compute recipients locally for history (mirrors on-chain):
      // base 1% platform fee; performance fee (bps) on remaining; split perf 20% treasury / 80% manager; investors receive the remaining pool pro-rata.
      const perfRaw = Number((selected as any).performanceFee ?? 0); // may be in % or bps
      const perfBps = perfRaw > 100 ? perfRaw : Math.round(perfRaw * 100);
      const platformFeeSol = value * 0.01;
      const afterPlatform = Math.max(0, value - platformFeeSol);
      const perfFeeSol = afterPlatform * (Math.max(0, Math.min(10000, perfBps)) / 10000);
      const treasuryFeeSol = perfFeeSol * 0.20;
      const managerFeeSol = perfFeeSol * 0.80;
      const investorPoolSol = Math.max(0, afterPlatform - perfFeeSol);
      const computedTotal = (selected.investments as any[])?.reduce((s, i) => s + Math.max(0, i.shares || 0), 0) || 0;
      const totalShares = Math.max(0, (selected.totalShares as number) ?? computedTotal);
      const recipients = (selected.investments as Array<{ walletAddress: string; shares: number }>)
        .map((inv) => {
          const portion = totalShares > 0 ? (Math.max(0, inv.shares || 0) / totalShares) : 0;
          return { wallet: inv.walletAddress, amountSol: investorPoolSol * portion };
        })
        .filter(r => r.amountSol > 0);

  // Append fee recipients for history (treasury + manager)
  const treasuryWallet = treasury || '';
      if (treasuryWallet) recipients.push({ wallet: treasuryWallet, amountSol: treasuryFeeSol });
      if (managerWallet) recipients.push({ wallet: managerWallet, amountSol: managerFeeSol });

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

      // Re-fetch the latest fund data so balances reflect the payout without a page reload
      try {
        const refRes = await fetch(`/api/trader/eligible?wallet=${wallet.publicKey!.toString()}`, { cache: 'no-store' });
        const refJson = await refRes.json();
        if (refJson?.success && Array.isArray(refJson.data?.funds)) {
          const updated = refJson.data.funds.find((f: any) => f.fundId === selected.fundId);
          if (updated) {
            setSelectedLocal(updated);
            setLocalPayments((updated.payments as FundDoc['payments']) || []);
          }
          if (typeof refJson.data?.treasury === 'string') {
            setTreasury(refJson.data.treasury);
          }
        }
      } catch (e) {
        console.warn('Post-payout refresh failed:', e);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payout failed');
    } finally {
      setLoading(false);
      setSubmitted(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-white/70">Fund</label>
          <select className="input w-full appearance-none pr-8" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {funds.map((f, idx) => (
              <option key={(f._id as string) || `fund-${idx}`} value={f.fundId as string}>{(f.name as string) || f.fundId as string}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-white/70">Payout Amount (SOL)</label>
          <Input
            value={payoutValue}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, '.');
              if (/^\d*(?:\.\d*)?$/.test(raw) || raw === '') setPayoutValue(raw);
            }}
            placeholder="0.5"
            className="input w-full"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button onClick={handlePayout} disabled={loading} className="w-full rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition">
            {loading ? 'Processing…' : 'Pay Investors'}
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
              <span className="text-xs text-white/50">Fund SOL Balance: {Number(((selectedLocal as any)?.solBalance ?? 0)).toFixed(6)} SOL</span>
              <span className="text-xs text-white/50">Total Shares: {Math.max(0, ((selectedLocal as any)?.totalShares as number) || (selected.totalShares as number) || 0)}</span>
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
                {(((selectedLocal as any)?.investments as any[]) || (selected.investments as any[]) || []).map((inv: any) => {
                  const shares = Math.max(0, inv.shares || 0);
                  const invs = (((selectedLocal as any)?.investments as any[]) || (selected.investments as any[]) || []);
                  const total = Math.max(0, invs.reduce((s: number, i: any) => s + Math.max(0, i.shares || 0), 0));
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
