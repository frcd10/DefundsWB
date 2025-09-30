'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';

interface InvestInDefundsModalProps {
  open: boolean;
  onClose: () => void;
}

export function InvestInDefundsModal({ open, onClose }: InvestInDefundsModalProps) {
  const wallet = useWallet();
  const [amount, setAmount] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const disabled = !wallet.connected || submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected) return;
    setSubmitting(true);
    setNotice('This investment flow will be enabled at mainnet launch.');
    setTimeout(() => setSubmitting(false), 1200);
  }

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-white">Invest in Defunds</DialogTitle>
            <DialogDescription className="text-white/70">Seed round preliminary reservation (simulated)</DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={submit} className="space-y-6 px-6 pb-7">
          {!wallet.connected && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-white/70">Connect your wallet to proceed</p>
              <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !font-semibold hover:!brightness-110 !transition" />
            </div>
          )}
          {wallet.connected && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Indicative Amount (SOL)</label>
                <input
                  value={amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/,/g, '.');
                    if (/^\d*(?:\.\d*)?$/.test(v)) setAmount(v);
                  }}
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white px-3 py-2"
                  placeholder="5"
                />
                <p className="text-xs text-white/50 mt-1">Non-binding expression of interest.</p>
              </div>
              {notice && (
                <div className="p-3 rounded-md bg-white/5 border border-white/10 text-xs text-white/70">{notice}</div>
              )}
              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disabled}
                  className="flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Reserve Allocation'}
                </button>
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
