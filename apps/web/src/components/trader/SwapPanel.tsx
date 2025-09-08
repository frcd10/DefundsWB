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

  const selectedFund = useMemo(() => funds.find(f => f.fundId === selectedFundId), [funds, selectedFundId]);

  const handleSwap = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const inAmountLamports = Math.floor(parseFloat(amount || '0') * 1e9);
      const res = await fetch('/api/trader/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fundId: selectedFundId, manager: managerWallet, fromMint, toMint, inAmountLamports })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Swap failed');
      setMessage('Swap recorded. Positions updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
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

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm text-sol-200">Amount (SOL)</label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-sol-800 border-sol-700 text-white" />
        </div>
        <div className="flex items-end">
          <Button onClick={handleSwap} disabled={loading} className="w-full">{loading ? 'Swapping...' : 'Swap'}</Button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
      {message && <div className="text-green-400 text-sm">{message}</div>}

      {selectedFund && (
        <div className="mt-4 text-sm text-sol-200">
          <p>Positions (approx):</p>
          <pre className="bg-sol-900/50 p-3 rounded border border-sol-700 overflow-auto">{JSON.stringify({ positions: selectedFund.positions || {}, solBalance: selectedFund.solBalance || 0 }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
