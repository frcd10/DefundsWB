'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FundDoc = {
  _id: string;
  fundId: string;
  name: string;
  positions?: Record<string, number>;
  solBalance?: number;
  totalDeposits?: number;
};

type GenericFund = Partial<FundDoc> & Record<string, unknown>;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export function SwapPanel({ funds, managerWallet }: { funds: GenericFund[]; managerWallet: string }) {
  const [selectedFundId, setSelectedFundId] = useState<string>((funds[0]?.fundId as string) || '');
  const [fromMint, setFromMint] = useState<string>(SOL_MINT);
  const [toMint, setToMint] = useState<string>('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // USDC devnet
  const [amount, setAmount] = useState<string>('0.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [localFunds, setLocalFunds] = useState<GenericFund[]>(funds);
  const selectedFund = useMemo(() => localFunds.find(f => f.fundId === selectedFundId), [localFunds, selectedFundId]);

  const handleSwap = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const inAmountLamports = Math.floor(parseFloat(amount || '0') * 1e9);
      if (!inAmountLamports || inAmountLamports <= 0) throw new Error('Invalid amount');
      // Simple placeholder rate: if swapping from SOL to other -> *20, other to SOL -> /20, else 1:1
      let outAmountLamports: number | undefined = undefined;
      if (fromMint === SOL_MINT && toMint !== SOL_MINT) outAmountLamports = inAmountLamports * 20;
      else if (toMint === SOL_MINT && fromMint !== SOL_MINT) outAmountLamports = Math.floor(inAmountLamports / 20);
      else if (fromMint !== toMint) outAmountLamports = inAmountLamports;

      const res = await fetch('/api/trader/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: selectedFundId, manager: managerWallet, fromMint, toMint, inAmountLamports, outAmountLamports })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Swap failed');
      // Update local fund positions immediately
      setLocalFunds(prev => prev.map(f => {
        if (f.fundId !== selectedFundId) return f;
        return {
          ...f,
          positions: data.data.positions,
          solBalance: data.data.solBalance,
        };
      }));
      setMessage('Swap recorded. Positions updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm text-white/70">Fund</label>
          <select className="input w-full appearance-none pr-8" value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)}>
            {funds.map((f: GenericFund, idx: number) => (
              <option key={(f._id as string) || `fund-${idx}`} value={f.fundId as string}>{(f.name as string) || f.fundId}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-white/70">From Mint</label>
          <Input value={fromMint} onChange={(e) => setFromMint(e.target.value)} className="input w-full" />
          <p className="text-xs text-white/50 mt-1">Use SOL mint for SOL: {SOL_MINT.slice(0,6)}...{SOL_MINT.slice(-6)}</p>
        </div>
        <div>
          <label className="text-sm text-white/70">To Mint</label>
          <Input value={toMint} onChange={(e) => setToMint(e.target.value)} className="input w-full" />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-white/70">Amount (SOL)</label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-full" />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSwap} disabled={loading} className="w-full rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition">{loading ? 'Swapping...' : 'Swap'}</Button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {message && <div className="text-green-400 text-sm">{message}</div>}

      {selectedFund && (
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Positions</h3>
            {(() => {
              const rawSol = typeof selectedFund.solBalance === 'number' ? selectedFund.solBalance : undefined;
              const displaySol = rawSol ?? 0;
              return <span className="text-xs text-white/50">SOL: {displaySol.toFixed(4)}</span>;
            })()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-brand-surface">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Mint</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Raw</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">Human</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="hover:bg-brand-yellow/5 transition">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">SOL</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{Math.floor((selectedFund.solBalance || 0) * 1e9)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{(selectedFund.solBalance || 0).toFixed(6)}</td>
                </tr>
                {Object.entries((selectedFund.positions || {}) as Record<string, number>).map(([mint, raw]) => {
                  const decimals = mint === SOL_MINT ? 9 : (mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' ? 6 : 9);
                  const human = (raw / 10 ** decimals).toFixed(6);
                  return (
                    <tr key={mint} className="hover:bg-brand-yellow/5 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{mint.slice(0,6)}...{mint.slice(-6)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{raw}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{human}</td>
                    </tr>
                  );
                })}
                {Object.keys(selectedFund.positions || {}).length === 0 && (
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/50" colSpan={3}>No token positions yet. SOL available may be held implicitly.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
