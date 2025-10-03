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
    accessMode: 'public' as 'public' | 'single_code' | 'multi_code',
    inviteCode: '',
    inviteCodes: [] as string[],
    maxPerInvestor: '' as string | ''
  });
  const [multiCodeCount, setMultiCodeCount] = useState(5);
  const [perInvestorInviteCodes, setPerInvestorInviteCodes] = useState(0);
  const MAX_MULTI_CODES = 2000;
  // Share overlay state (for all access modes)
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareAccessMode, setShareAccessMode] = useState<'public' | 'single_code' | 'multi_code'>('public');
  const [shareSingleCode, setShareSingleCode] = useState('');
  const [shareCodes, setShareCodes] = useState<string[]>([]);
  const [shareName, setShareName] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
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
      const body: any = {
        fundId,
        manager: wallet.publicKey.toString(),
        name: form.name,
        description: form.description,
        fundType: form.fundType,
        performanceFee: form.performanceFee,
        maxCapacity: form.maxCapacity,
        isPublic: form.accessMode === 'public',
        signature,
        initialDeposit: form.initialDeposit,
        accessMode: form.accessMode
      };
      if (form.accessMode === 'single_code') body.inviteCode = form.inviteCode.toUpperCase();
      else if (form.accessMode === 'multi_code') {
        if (form.inviteCodes.length > 0) body.inviteCodes = form.inviteCodes; else body.inviteCodesCount = multiCodeCount;
        body.perInvestorInviteCodes = perInvestorInviteCodes;
      }
      if (form.maxPerInvestor) body.maxPerInvestor = Number(form.maxPerInvestor);

      const res = await fetch('/api/rwa/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to save RWA product');
      }
      const data = await res.json();
      // Prepare share overlay for all access modes
      setShareAccessMode(form.accessMode);
      setShareSingleCode(form.accessMode === 'single_code' ? form.inviteCode.toUpperCase() : '');
      setShareName(form.name);
      setCreatedId(fundId);
      if (form.accessMode === 'multi_code') {
        const codes: string[] = (data?.data?.access?.codes?.map((c: any) => c.code)) || data?.inviteCodes || [];
        setShareCodes(Array.isArray(codes) ? codes : []);
      } else {
        setShareCodes([]);
      }
      setShowShareDialog(true);
      // reset form behind
      setForm({ name: '', description: '', fundType: 'Construction', performanceFee: 10, maxCapacity: 5000, isPublic: true, initialDeposit: 0.5, accessMode: 'public', inviteCode: '', inviteCodes: [], maxPerInvestor: '' });
      setInitialDepositInput('0.5');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
  <Dialog open={isOpen && !showShareDialog} onOpenChange={onClose}>
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
              {/* Access options */}
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Access</label>
                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="rwaAccessMode" value="public" checked={form.accessMode === 'public'} onChange={() => setForm({ ...form, accessMode: 'public' })} className="mt-1 accent-brand-yellow" />
                    <div>
                      <div className="text-sm font-medium">Public – anyone can invest</div>
                      <p className="text-xs text-white/50 mt-0.5">Product appears as open access. No codes required.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="rwaAccessMode" value="single_code" checked={form.accessMode === 'single_code'} onChange={() => setForm({ ...form, accessMode: 'single_code' })} className="mt-1 accent-brand-yellow" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Invite Code – shared code</div>
                      <p className="text-xs text-white/50 mt-0.5">Anyone with this code can invest. You define it (up to 10 digits).</p>
                      {form.accessMode === 'single_code' && (
                        <div className="mt-2">
                          <Input
                            placeholder="Choose code (letters/numbers)"
                            value={form.inviteCode}
                            maxLength={10}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                              setForm(prev => ({ ...prev, inviteCode: v }));
                            }}
                            className="w-full rounded-lg bg-white/10 border-white/20 text-sm tracking-wider"
                          />
                          <p className="text-[10px] text-white/40 mt-1">1–10 alphanumeric characters. Not case sensitive when investors enter.</p>
                        </div>
                      )}
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="radio" name="rwaAccessMode" value="multi_code" checked={form.accessMode === 'multi_code'} onChange={() => setForm({ ...form, accessMode: 'multi_code' })} className="mt-1 accent-brand-yellow" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">One-Time Codes – limited slots</div>
                      <p className="text-xs text-white/50 mt-0.5">Generate multiple 6-digit codes. Each code usable once.</p>
                      {form.accessMode === 'multi_code' && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-white/60">Number of one-time codes</label>
                            <Input type="number" min={1} max={MAX_MULTI_CODES} value={multiCodeCount} onChange={(e) => setMultiCodeCount(Math.min(MAX_MULTI_CODES, Math.max(1, Number(e.target.value))))} className="w-28 rounded-lg bg-white/10 border-white/20 text-sm" />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-white/60">Codes per investor (optional)</label>
                            <Input type="number" min={0} max={5} value={perInvestorInviteCodes} onChange={(e) => setPerInvestorInviteCodes(Math.max(0, Math.min(5, Number(e.target.value || 0))))} className="w-28 rounded-lg bg-white/10 border-white/20 text-sm" />
                          </div>
                          <p className="text-[10px] text-white/40">Codes generated after creation. Consult later in manager panel.</p>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Max Investment Per User (SOL) <span className="text-white/40">(optional)</span></label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.maxPerInvestor}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!/^\d*(?:[.,]?\d*)?$/.test(raw)) return;
                    setForm(prev => ({ ...prev, maxPerInvestor: raw }));
                  }}
                  onBlur={() => {
                    if (form.maxPerInvestor === '') return;
                    const normalized = form.maxPerInvestor.replace(/,/g, '.');
                    setForm(prev => ({ ...prev, maxPerInvestor: normalized }));
                  }}
                  placeholder="e.g. 100 or 0.5"
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                />
                <p className="text-xs text-white/50 mt-1">If set, a wallet cannot exceed this cumulative SOL invested.</p>
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
    {showShareDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={() => { setShowShareDialog(false); onCreated?.(createdId || ''); setCreatedId(null); onClose(); setShareAccessMode('public'); setShareSingleCode(''); setShareCodes([]); setShareName(''); }} />
        <div className="relative z-10 w-[90vw] max-w-xl max-h-[80vh] bg-[#0F0F10] border border-white/10 rounded-2xl p-6 flex flex-col">
          <h3 className="text-xl font-semibold mb-2">Share your RWA product</h3>
          <p className="text-sm text-white/60 mb-4">Let people know your product is live.</p>
          {shareAccessMode === 'multi_code' && shareCodes.length > 0 && (
            <>
              <div className="flex gap-2 mb-4">
                <button onClick={() => navigator.clipboard.writeText(shareCodes.join('\n'))} className="px-4 py-2 rounded-full bg-brand-yellow text-brand-black text-sm font-semibold hover:brightness-110">Copy All</button>
                <button onClick={() => { const blob = new Blob([shareCodes.join('\n')], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'rwa_invite_codes.txt'; a.click(); URL.revokeObjectURL(url); }} className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15">Download .txt</button>
              </div>
              <div className="overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 grid grid-cols-3 gap-2 text-[11px] font-mono mb-4">
                {shareCodes.map(c => (<div key={c} className="px-2 py-1 bg-white/10 rounded text-center select-all tracking-wider">{c}</div>))}
              </div>
            </>
          )}
          {shareAccessMode === 'single_code' && shareSingleCode && (
            <div className="mb-4">
              <p className="text-xs text-white/60 mb-2">Shared invite code</p>
              <div className="px-3 py-2 inline-block rounded bg-white/10 border border-white/15 font-mono text-[12px] tracking-wider select-all">{shareSingleCode}</div>
            </div>
          )}
          <div className="flex gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent([
                `I just created an RWA product on @DefundsFinance`,
                shareName ? `(${shareName})` : undefined,
                shareAccessMode === 'single_code' && shareSingleCode ? `Access code: ${shareSingleCode}` : undefined,
                shareAccessMode === 'multi_code' && shareCodes.length > 0 ? `Starter access codes: ${shareCodes.slice(0, 5).join(', ')}` : undefined,
                `${typeof window !== 'undefined' ? window.location.origin : ''}/rwa`
              ].filter(Boolean).join(' \n '))}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 px-4 py-2 rounded-full bg-[#1DA1F2] text-white text-sm font-semibold hover:brightness-110 text-center"
            >Share on X</a>
            <button onClick={() => { setShowShareDialog(false); onCreated?.(createdId || ''); setCreatedId(null); onClose(); setShareAccessMode('public'); setShareSingleCode(''); setShareCodes([]); setShareName(''); }} className="flex-1 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15">Done</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
