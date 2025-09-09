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
          <label className="text-sm text-sol-200">Fund</label>
          <select className="w-full bg-sol-800 border border-sol-700 rounded px-3 py-2 text-white" value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)}>
            {funds.map((f: GenericFund, idx: number) => (
              <option key={(f._id as string) || `fund-${idx}`} value={f.fundId as string}>{(f.name as string) || f.fundId}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-sol-200">From Mint</label>
          <Input value={fromMint} onChange={(e) => setFromMint(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
          <p className="text-xs text-sol-400 mt-1">Use SOL mint for SOL: {SOL_MINT.slice(0,6)}...{SOL_MINT.slice(-6)}</p>
        </div>
        <div>
          <label className="text-sm text-sol-200">To Mint</label>
          <Input value={toMint} onChange={(e) => setToMint(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-sm text-sol-200">Amount (SOL)</label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSwap} disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:brightness-110 transition">{loading ? 'Swapping...' : 'Swap'}</Button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {message && <div className="text-green-400 text-sm">{message}</div>}

      {selectedFund && (
        <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 overflow-hidden">
          <div className="p-4 border-b border-sol-700 flex items-center justify-between">
            <h3 className="text-lg font-bold text-sol-50">Positions</h3>
            {(() => {
              const rawSol = typeof selectedFund.solBalance === 'number' ? selectedFund.solBalance : undefined;
              // Sum non-SOL token values if we can infer approximate SOL equivalent (not reliable without prices)
              // For now just show stored solBalance or 0; after we initialized solBalance on create/invest it should be present.
              const displaySol = rawSol ?? 0;
              return <span className="text-xs text-sol-300">SOL: {displaySol.toFixed(4)}</span>;
            })()}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sol-800/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Mint</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Raw</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Human</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-700">
                {/* Explicit SOL row from tracked solBalance for clarity */}
                <tr className="hover:bg-sol-800/40">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">SOL</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{Math.floor((selectedFund.solBalance || 0) * 1e9)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{(selectedFund.solBalance || 0).toFixed(6)}</td>
                </tr>
                {Object.entries((selectedFund.positions || {}) as Record<string, number>).map(([mint, raw]) => {
                  const decimals = mint === SOL_MINT ? 9 : (mint === '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' ? 6 : 9);
                  const human = (raw / 10 ** decimals).toFixed(6);
                  return (
                    <tr key={mint} className="hover:bg-sol-800/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{mint.slice(0,6)}...{mint.slice(-6)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{raw}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-50">{human}</td>
                    </tr>
                  );
                })}
                {Object.keys(selectedFund.positions || {}).length === 0 && (
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-sol-400" colSpan={3}>No token positions yet. SOL available may be held implicitly.</td>
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
