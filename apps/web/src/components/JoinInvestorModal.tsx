'use client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';

interface JoinInvestorModalProps { open: boolean; onClose: () => void; }

export function JoinInvestorModal({ open, onClose }: JoinInvestorModalProps) {
  const wallet = useWallet();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [investmentGoal, setInvestmentGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.connected) { setError('Wallet connection required'); return; }
    if (!name.trim() || !email.trim()) { setError('Name & email required'); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/investor/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, message, phone, telegram, x: xHandle, investmentGoal, wallet: wallet.publicKey?.toString() }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed');
      setDone(true);
    } catch (e:any) {
      setError(e?.message || 'Failed');
    } finally { setSubmitting(false); }
  }

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        {done ? (
          <div className="px-8 py-14 flex flex-col items-center text-center gap-6">
            <h2 className="text-2xl font-bold">Submission Received</h2>
            <p className="text-sm text-white/70 max-w-sm">Thank you. Your investor profile has been recorded. Our team will reach out after reviewing your details.</p>
            <button onClick={onClose} className="inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 px-10 hover:brightness-110 transition">Close</button>
          </div>
        ) : (
          <div className="px-6 pt-6 pb-7">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-extrabold text-center">Investor Interest Form</DialogTitle>
              <DialogDescription className="text-white/70 text-center">Wallet, name & email required. Other fields help us contextualize your profile.</DialogDescription>
            </DialogHeader>
            {!wallet.connected ? (
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className="text-sm text-white/70">Connect your wallet to start.</p>
                <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-8 !py-3 !font-semibold hover:!brightness-110 !transition" />
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div className="text-xs text-white/60 leading-relaxed bg-white/5 border border-white/10 p-4 rounded-xl">
                  Provide your basic info. Add anything strategic (track record, allocation interest, jurisdiction, value‑add) in the free form field below.
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">Name *</label>
                    <input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2" placeholder="Jane Doe" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">Email *</label>
                    <input value={email} onChange={e=>setEmail(e.target.value)} type="email" className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2" placeholder="you@example.com" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">Phone</label>
                    <input value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2" placeholder="+1 555 123 4567" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">Telegram</label>
                    <input value={telegram} onChange={e=>setTelegram(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2" placeholder="@username" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">X (Twitter)</label>
                    <input value={xHandle} onChange={e=>setXHandle(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2" placeholder="@handle" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-white/70">Investment Goal</label>
                    <div className="relative">
                      <select
                        value={investmentGoal}
                        onChange={e=>setInvestmentGoal(e.target.value)}
                        className="w-full appearance-none rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-2 pr-10 [color-scheme:dark]"
                      >
                        <option value="" disabled>Select range</option>
                        <option className="bg-[#0B0B0C]" value="<25k">&lt;25k</option>
                        <option className="bg-[#0B0B0C]" value="25-150k">25 to 150k</option>
                        <option className="bg-[#0B0B0C]" value=">150k">150k+</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-[10px] tracking-wider">▼</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70">Message (optional)</label>
                  <textarea value={message} onChange={e=>setMessage(e.target.value)} className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm text-white px-3 py-3 min-h-32 resize-y" placeholder="Background, allocation interest, timeline, questions..." />
                </div>
                {error && <div className="p-3 rounded-md bg-red-900/30 border border-red-700 text-xs text-red-300">{error}</div>}
                <div className="flex gap-4 pt-2">
                  <button type="button" onClick={onClose} className="flex-1 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 transition">Cancel</button>
                  <button type="submit" disabled={submitting || !name.trim() || !email.trim()} className="flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit'}</button>
                </div>
              </form>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
