'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundServiceModular as solanaFundService, CreateFundParams } from '@/services/solanaFund';
import { FundType } from '@/types/fund';

interface CreateRealFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFundCreated?: (fundId: string) => void;
}

const FUND_TYPES: FundType[] = [
  'Memes',
  'Arbitrage', 
  'Leverage Futures',
  'Long Biased',
  'Long Only',
  'Sniper',
  'Quantitative',
  'BTC only',
  'ETH only',
  'SOL only',
  'BIG 3 only',
  'Yield Farming'
];

export function CreateRealFundModal({ isOpen, onClose, onFundCreated }: CreateRealFundModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fundType: 'Long Only' as FundType,
    performanceFee: 20,
    maxCapacity: 100,
    isPublic: true, // kept for backward compatibility toggle with public mode
    initialDeposit: 1.0,
    accessMode: 'public' as 'public' | 'single_code' | 'multi_code',
    inviteCode: '', // for single_code
    inviteCodes: [] as string[], // for multi_code (generated one-time codes)
    maxPerInvestor: '' as string | ''
  });
  const [multiCodeCount, setMultiCodeCount] = useState(5);
  const MAX_MULTI_CODES = 2000;
  const DECIMAL_INPUT_REGEX = /^\d*(?:[.,]?\d*)?$/;
  // Keep a raw string so user can type interim states like "0." or ".1"
  const [initialDepositInput, setInitialDepositInput] = useState('1.0');

  // Reusable parser allowing "," or "." and tolerant of transient states ("", ".", "0.")
  const DECIMAL_REGEX = /^\d*(?:[.,]?\d*)?$/; // allows '', '0', '0.', '.5', '12.34'
  const commitInitialDepositFromString = (raw: string) => {
    const normalized = raw.replace(/,/g, '.');
    if (normalized === '' || normalized === '.' || normalized === '0.') {
      setFormData(prev => ({ ...prev, initialDeposit: 0 }));
      return;
    }
    const n = Number(normalized);
    if (Number.isFinite(n)) {
      setFormData(prev => ({ ...prev, initialDeposit: n }));
    }
  };

  const [showCodesDialog, setShowCodesDialog] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [createdFundId, setCreatedFundId] = useState<string | null>(null);
  // Removed intermediate 'generatingCodes' phase since codes are now returned instantly

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      fundType: 'Long Only',
      performanceFee: 20,
      maxCapacity: 100,
      isPublic: true,
      initialDeposit: 1.0,
      accessMode: 'public',
      inviteCode: '',
      inviteCodes: [],
      maxPerInvestor: ''
    });
    setInitialDepositInput('1.0');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('=== CREATING FUND ===');
      console.log('Wallet connected:', wallet.connected);
      console.log('Wallet publicKey:', wallet.publicKey?.toString());
      
      // Create fund on Solana
      const params: CreateFundParams = {
        name: formData.name,
        description: formData.description,
        fundType: formData.fundType,
        performanceFee: formData.performanceFee,
        maxCapacity: formData.maxCapacity,
        isPublic: formData.accessMode === 'public',
        initialDeposit: formData.initialDeposit
      };

      console.log('Creating fund with params:', params);
      const result = await solanaFundService.createFund(wallet, params);
      console.log('Solana service result:', result);
      
      // Store fund data in backend
      const requestBody: any = {
        fundId: result.fundId,
        manager: wallet.publicKey.toString(),
        name: formData.name,
        description: formData.description,
        fundType: formData.fundType,
        performanceFee: formData.performanceFee,
        maxCapacity: formData.maxCapacity,
        isPublic: formData.accessMode === 'public',
        signature: result.signature,
        initialDeposit: formData.initialDeposit,
        accessMode: formData.accessMode
      };
      if (formData.accessMode === 'single_code') {
        requestBody.inviteCode = formData.inviteCode.toUpperCase();
      } else if (formData.accessMode === 'multi_code') {
        if (formData.inviteCodes.length > 0) {
          requestBody.inviteCodes = formData.inviteCodes;
        } else {
          requestBody.inviteCodesCount = multiCodeCount;
        }
      }
      if (formData.maxPerInvestor) {
        requestBody.maxPerInvestor = Number(formData.maxPerInvestor);
      }
      
      console.log('Sending request to backend:', requestBody);
      
      const response = await fetch('/api/funds/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Show generatingCodes phase while waiting for backend when multi_code
      // No spinner phase needed

      console.log('Backend response status:', response.status);
      console.log('Backend response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error response:', errorData);
        throw new Error(errorData.error || 'Failed to save fund to database');
      }

      const responseData = await response.json(); // Parse exactly once
      console.log('Backend success response:', responseData);

      // Success! Capture generated codes from response for multi_code using the single parsed result
      if (formData.accessMode === 'multi_code') {
        const codesFromResponse: string[] = (responseData?.data?.access?.codes?.map((c: any) => c.code)) || responseData?.inviteCodes || [];
        setGeneratedCodes(codesFromResponse);
        // Clear the form so user doesn't see old values behind codes dialog
        resetForm();
        setShowCodesDialog(true);
        setCreatedFundId(result.fundId);
      } else {
        onFundCreated?.(result.fundId);
        onClose();
        resetForm();
      }

    } catch (error) {
      console.error('=== ERROR CREATING FUND ===');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      setError(error instanceof Error ? error.message : 'Failed to create fund');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
    {!showCodesDialog && (
    <Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-[640px] max-h-[90vh] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden flex flex-col">
    {/* Decorative top gradient bar */}
    <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
  <div className="px-6 pt-6 pb-2">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold text-white">
            Create Real Fund on Solana
          </DialogTitle>
          <DialogDescription className="text-white/70">
            Create a real fund on Solana devnet. You&apos;ll need SOL in your wallet for transactions.
          </DialogDescription>
        </DialogHeader>

    </div>
  <div className="space-y-5 px-6 pb-7 overflow-y-auto custom-scrollbar">
          {showCodesDialog ? (
            <div className="py-16 flex flex-col items-center justify-center text-white/60 text-sm">
              {/* Intentionally minimal so codes dialog is the focus */}
            </div>
          ) : !wallet.connected ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-white/70">Connect your wallet to create a fund</p>
              <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !font-semibold hover:!brightness-110 !transition" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Fund Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Alpha Trading Fund"
                  required
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Description</label>
                <textarea
                  className="w-full resize-none min-h-24 rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 p-3 leading-relaxed"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your fund's strategy..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Fund Type</label>
                <select
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm p-3"
                  value={formData.fundType}
                  onChange={(e) => setFormData(prev => ({ ...prev, fundType: e.target.value as FundType }))}
                >
                  {FUND_TYPES.map(type => (
                    <option key={type} value={type} className="bg-brand-black text-white">{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70">Performance Fee (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={formData.performanceFee}
                    onChange={(e) => setFormData(prev => ({ ...prev, performanceFee: Number(e.target.value) }))}
                    className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-white/70">Max Capacity (SOL)</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxCapacity: Number(e.target.value) }))}
                    className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Max Investment Per User (SOL) <span className="text-white/40">(optional)</span></label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.maxPerInvestor}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!DECIMAL_INPUT_REGEX.test(raw)) return;
                    setFormData(prev => ({ ...prev, maxPerInvestor: raw }));
                  }}
                  onBlur={() => {
                    if (formData.maxPerInvestor === '') return;
                    const normalized = formData.maxPerInvestor.replace(/,/g, '.');
                    setFormData(prev => ({ ...prev, maxPerInvestor: normalized }));
                  }}
                  placeholder="e.g. 50 or 0.5"
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                />
                <p className="text-xs text-white/50 mt-1">If set, a wallet cannot exceed this cumulative SOL invested.</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Initial Deposit (SOL)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={initialDepositInput}
                  placeholder="0.1"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!DECIMAL_REGEX.test(raw)) return; // ignore invalid chars
                    setInitialDepositInput(raw);
                    commitInitialDepositFromString(raw);
                  }}
                  onBlur={() => {
                    setInitialDepositInput(String(formData.initialDeposit));
                  }}
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30"
                />
                <p className="text-xs text-white/50 mt-1">
                  You&apos;ll own 100% of the fund initially. Others can invest later.
                </p>
                <p className="text-xs text-white/50 mt-1">
                  Fund creation requires two signatures: 1) a small rent fee to create the fund accounts (~0.006–0.010 SOL), 2) your initial deposit (the SOL amount above).
                </p>
              </div>

              {/* Access Mode Selection */}
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Access</label>
                <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="accessMode"
                      value="public"
                      checked={formData.accessMode === 'public'}
                      onChange={() => setFormData(p => ({ ...p, accessMode: 'public' }))}
                      className="mt-1 accent-brand-yellow"
                    />
                    <div>
                      <div className="text-sm font-medium">Public – anyone can invest</div>
                      <p className="text-xs text-white/50 mt-0.5">Fund appears as open access. No codes required.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="accessMode"
                      value="single_code"
                      checked={formData.accessMode === 'single_code'}
                      onChange={() => setFormData(p => ({ ...p, accessMode: 'single_code' }))}
                      className="mt-1 accent-brand-yellow"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Invite Code – shared code</div>
                      <p className="text-xs text-white/50 mt-0.5">Anyone with this code can invest. You define it (up to 10 digits).</p>
                      {formData.accessMode === 'single_code' && (
                        <div className="mt-2">
                          <Input
                            placeholder="Choose code (letters/numbers)"
                            value={formData.inviteCode}
                            maxLength={10}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                              setFormData(p => ({ ...p, inviteCode: v }));
                            }}
                            className="w-full rounded-lg bg-white/10 border-white/20 text-sm tracking-wider"
                          />
                          <p className="text-[10px] text-white/40 mt-1">1–10 alphanumeric characters. Not case sensitive when investors enter.</p>
                        </div>
                      )}
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="accessMode"
                      value="multi_code"
                      checked={formData.accessMode === 'multi_code'}
                      onChange={() => setFormData(p => ({ ...p, accessMode: 'multi_code' }))}
                      className="mt-1 accent-brand-yellow"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">One-Time Codes – limited slots</div>
                      <p className="text-xs text-white/50 mt-0.5">Generate multiple 6-digit codes. Each code usable once.</p>
                      {formData.accessMode === 'multi_code' && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <label className="text-xs text-white/60">Number of one-time codes</label>
                            <Input
                              type="number"
                              min={1}
                              max={MAX_MULTI_CODES}
                              value={multiCodeCount}
                              onChange={(e) => setMultiCodeCount(Math.min(MAX_MULTI_CODES, Math.max(1, Number(e.target.value))))}
                              className="w-28 rounded-lg bg-white/10 border-white/20 text-sm"
                            />
                          </div>
                          <p className="text-[10px] text-white/40">Codes generated after fund creation. You can copy them then or later in the trader panel.</p>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-900/30 border border-red-700 rounded-md">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

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
                  {isLoading ? 'Creating...' : 'Create Fund'}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
      {showCodesDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowCodesDialog(false); onFundCreated?.(createdFundId || ''); setCreatedFundId(null); resetForm(); onClose(); }} />
          <div className="relative z-10 w-[90vw] max-w-xl max-h-[80vh] bg-[#0F0F10] border border-white/10 rounded-2xl p-6 flex flex-col">
            <h3 className="text-xl font-semibold mb-2">One-Time Invite Codes</h3>
            <p className="text-sm text-white/60 mb-4">Share these with investors. Each can be used once. You can consult them later in the trader panel.</p>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => navigator.clipboard.writeText(generatedCodes.join('\n'))}
                className="px-4 py-2 rounded-full bg-brand-yellow text-brand-black text-sm font-semibold hover:brightness-110"
              >Copy All</button>
              <button
                onClick={() => {
                  const blob = new Blob([generatedCodes.join('\n')], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'fund_invite_codes.txt';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15"
              >Download .txt</button>
              <button
                onClick={() => { setShowCodesDialog(false); onFundCreated?.(createdFundId || ''); setCreatedFundId(null); resetForm(); onClose(); }}
                className="ml-auto px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15"
              >Done</button>
            </div>
            <div className="overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 grid grid-cols-3 gap-2 text-[11px] font-mono">
              {generatedCodes.map(c => (
                <div key={c} className="px-2 py-1 bg-white/10 rounded text-center select-all tracking-wider">{c}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
    )}
    {showCodesDialog && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70" onClick={() => { setShowCodesDialog(false); onFundCreated?.(createdFundId || ''); setCreatedFundId(null); resetForm(); onClose(); }} />
        <div className="relative z-10 w-[90vw] max-w-xl max-h-[80vh] bg-[#0F0F10] border border-white/10 rounded-2xl p-6 flex flex-col">
          <h3 className="text-xl font-semibold mb-2">One-Time Invite Codes</h3>
          <p className="text-sm text-white/60 mb-4">Share these with investors. Each can be used once. You can consult them later in the trader panel.</p>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => navigator.clipboard.writeText(generatedCodes.join('\n'))}
              className="px-4 py-2 rounded-full bg-brand-yellow text-brand-black text-sm font-semibold hover:brightness-110"
            >Copy All</button>
            <button
              onClick={() => {
                const blob = new Blob([generatedCodes.join('\n')], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'fund_invite_codes.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15"
            >Download .txt</button>
            <button
              onClick={() => { setShowCodesDialog(false); onFundCreated?.(createdFundId || ''); setCreatedFundId(null); resetForm(); onClose(); }}
              className="ml-auto px-4 py-2 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15"
            >Done</button>
          </div>
          <div className="overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 grid grid-cols-3 gap-2 text-[11px] font-mono">
            {generatedCodes.map(c => (
              <div key={c} className="px-2 py-1 bg-white/10 rounded text-center select-all tracking-wider">{c}</div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
