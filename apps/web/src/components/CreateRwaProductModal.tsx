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
      <DialogContent className="sm:max-w-[560px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-white">Create RWA Product</DialogTitle>
            <DialogDescription className="text-white/70">Tokenize a real-world exposure. Parameters can be adjusted before public investors enter.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-5 px-6 pb-7">
          {!wallet.connected ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-white/70">Connect your wallet to create an RWA product</p>
              <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !font-semibold hover:!brightness-110 !transition" />
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Description</label>
                <textarea className="w-full resize-none min-h-24 rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 p-3 leading-relaxed" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Type</label>
                <select className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm p-3" value={form.fundType} onChange={(e) => setForm({ ...form, fundType: e.target.value as FundType })}>
                  {RWA_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-brand-black text-white">{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70">Performance Fee (%)</label>
                  <Input type="number" min="0" max="50" value={form.performanceFee} onChange={(e) => setForm({ ...form, performanceFee: Number(e.target.value) })} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70">Max Capacity (SOL)</label>
                  <Input type="number" min="0" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Initial Deposit (SOL)</label>
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
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input type="checkbox" id="rwapublic" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} className="h-4 w-4 accent-brand-yellow" />
                <label htmlFor="rwapublic" className="text-sm text-white/70">Public product (anyone can invest)</label>
              </div>
              {error && <div className="p-3 bg-red-900/30 border border-red-700 rounded-md"><p className="text-sm text-red-300">{error}</p></div>}
              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating…' : 'Create RWA'}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
