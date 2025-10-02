"use client";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { useWallet } from '@solana/wallet-adapter-react';

interface InvestRwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    fundId: string;
    name?: string;
    accessMode?: string;
    access?: { type: string; code?: string; codes?: { code: string; used?: boolean }[] };
  } | null;
  onInvested?: () => void;
}

export function InvestRwaModal({ isOpen, onClose, product, onInvested }: InvestRwaModalProps) {
  const wallet = useWallet();
  const [amount, setAmount] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!product) return null;
  const mode = product.accessMode || product.access?.type || 'public';
  const needsCode = mode === 'single_code' || mode === 'multi_code';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallet.publicKey) {
      setError('Connect wallet first');
      return;
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (needsCode && !inviteCode.trim()) {
      setError('Invite code required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const signature = 'mock_signature_disabled'; // Replace with real tx flow when integrated
      const res = await fetch('/api/rwa/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fundId: product.fundId,
          investorWallet: wallet.publicKey.toString(),
            amount: num,
            signature,
            inviteCode: needsCode ? inviteCode.trim().toUpperCase() : undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Investment failed');
      onInvested?.();
      onClose();
      setAmount('');
      setInviteCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Investment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Invest in {product.name || product.fundId}</DialogTitle>
            <DialogDescription className="text-white/60 text-sm">Enter amount of SOL to invest{needsCode ? ' and provide invite code' : ''}.</DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={submit} className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1 text-white/60">Amount (SOL)</label>
            <Input value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.5" className="bg-white/5 border-white/15 text-sm" />
          </div>
          {needsCode && (
            <div>
              <label className="block text-xs font-medium mb-1 text-white/60">Invite Code</label>
              <Input value={inviteCode} maxLength={10} onChange={e => setInviteCode(e.target.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase())} placeholder="CODE" className="bg-white/5 border-white/15 text-sm tracking-wider" />
              <p className="text-[10px] text-white/40 mt-1">Case-insensitive. Single code or unused one-time code.</p>
            </div>
          )}
          {error && <div className="p-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-300">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white/70 hover:text-white transition disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 h-10 rounded-full bg-brand-yellow text-brand-black font-semibold text-xs shadow hover:brightness-110 disabled:opacity-60">{loading ? 'Processing...' : 'Invest'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
