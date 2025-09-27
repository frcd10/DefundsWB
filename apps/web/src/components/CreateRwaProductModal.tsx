'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FundType } from '@/types/fund';
import { solanaFundServiceModular as solanaFundService, CreateFundParams } from '@/services/solanaFund';

interface CreateRwaProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (fundId: string) => void;
}

const RWA_TYPES: FundType[] = ['Construction', 'Advance Receivable'];

export function CreateRwaProductModal({ isOpen, onClose, onCreated }: CreateRwaProductModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    fundType: 'Construction' as FundType,
    performanceFee: 10,
    maxCapacity: 5000,
    isPublic: true,
    initialDeposit: 0.5,
  });
  const [initialDepositInput, setInitialDepositInput] = useState('0.5');
  const DECIMAL_REGEX = /^\d*(?:[.,]?\d*)?$/;
  const commitInitialDepositFromString = (raw: string) => {
    const normalized = raw.replace(/,/g, '.');
    if (normalized === '' || normalized === '.' || normalized === '0.') {
      setForm({ ...form, initialDeposit: 0 });
      return;
    }
    const n = Number(normalized);
    if (Number.isFinite(n)) setForm({ ...form, initialDeposit: n });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // Create using same on-chain instruction set as funds
      const params: CreateFundParams = {
        name: form.name,
        description: form.description,
        fundType: form.fundType,
        performanceFee: form.performanceFee,
        maxCapacity: form.maxCapacity,
        isPublic: form.isPublic,
        initialDeposit: form.initialDeposit,
      };
      const { fundId, signature } = await solanaFundService.createFund(wallet, params);

      // Persist to Rwa collection
      const res = await fetch('/api/rwa/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundId,
          manager: wallet.publicKey.toString(),
          name: form.name,
          description: form.description,
          fundType: form.fundType,
          performanceFee: form.performanceFee,
          maxCapacity: form.maxCapacity,
          isPublic: form.isPublic,
          signature,
          initialDeposit: form.initialDeposit,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save RWA product');
      }
      onCreated?.(fundId);
      onClose();
      setForm({ name: '', description: '', fundType: 'Construction', performanceFee: 10, maxCapacity: 5000, isPublic: true, initialDeposit: 0.5 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[540px] bg-sol-800/90 border border-sol-700 text-sol-50 mt-16 sm:mt-24">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold text-sol-50">Create RWA Product</DialogTitle>
          <DialogDescription className="text-sol-200">Create an on-chain RWA product. Uses the same program paths as funds.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!wallet.connected ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-sol-200">Connect your wallet to create</p>
              <WalletMultiButton className="!bg-gradient-to-r !from-sol-accent !to-cyan-400 !text-sol-900 !rounded-xl !font-semibold hover:!scale-105 !transition" />
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-sol-100">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-sol-100">Description</label>
                <textarea className="input w-full resize-none min-h-24" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-sol-100">Type</label>
                <select className="input w-full" value={form.fundType} onChange={(e) => setForm({ ...form, fundType: e.target.value as FundType })}>
                  {RWA_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-sol-100">Performance Fee (%)</label>
                  <Input type="number" min="0" max="50" value={form.performanceFee} onChange={(e) => setForm({ ...form, performanceFee: Number(e.target.value) })} className="input w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-sol-100">Max Capacity (SOL)</label>
                  <Input type="number" min="0" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} className="input w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-sol-100">Initial Deposit (SOL)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={initialDepositInput}
                  placeholder="0.5"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!DECIMAL_REGEX.test(raw)) return;
                    setInitialDepositInput(raw);
                    commitInitialDepositFromString(raw);
                  }}
                  onBlur={() => setInitialDepositInput(String(form.initialDeposit))}
                  className="input w-full"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="rwapublic" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} className="h-4 w-4 accent-sol-accent" />
                <label htmlFor="rwapublic" className="text-sm text-sol-100">Public product (anyone can invest)</label>
              </div>
              {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-md"><p className="text-sm text-red-300">{error}</p></div>}
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-sol-700 text-sol-50">Cancel</Button>
                <Button type="submit" disabled={isLoading} className="flex-1 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:scale-105 transition">{isLoading ? 'Creating…' : 'Create RWA'}</Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
