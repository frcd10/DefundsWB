'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundServiceModular as solanaFundService } from '@/services/solanaFund';

interface InvestInFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  fundId: string;
  fundName: string;
  // If true, records the investment using the RWA API instead of Funds API
  isRwa?: boolean;
  onInvestmentComplete?: (signature: string) => void;
  requiresInviteCode?: boolean; // new: whether an invite code is required to invest
  canRequestInviteCodesCount?: number; // 0-5 allowed; when >0 show selector to request new codes
}

export function InvestInFundModal({ 
  isOpen, 
  onClose, 
  fundId, 
  fundName,
  isRwa = false,
  onInvestmentComplete,
  requiresInviteCode = false,
  canRequestInviteCodesCount
}: InvestInFundModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('0.1');
  const [submitted, setSubmitted] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [requestCodes, setRequestCodes] = useState(0);
  const [grantedCodes, setGrantedCodes] = useState<string[] | null>(null);
  const [investSuccess, setInvestSuccess] = useState(false);
  const [usedCode, setUsedCode] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('=== INVESTMENT ATTEMPT ===');
    console.log('Fund ID:', fundId);
    console.log('Fund Name:', fundName);
    console.log('Investment Amount:', amount, 'SOL');
    console.log('Wallet connected:', !!wallet.connected);
    console.log('Wallet public key:', wallet.publicKey?.toString());

    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet');
      return;
    }

  const normalized = amount.replace(/,/g, '.');
  const investmentAmount = parseFloat(normalized);
    if (isNaN(investmentAmount) || investmentAmount <= 0) {
      setError('Please enter a valid investment amount');
      return;
    }

    if (requiresInviteCode && !inviteCode.trim()) {
      setError('Invite code required');
      return;
    }

    if (submitted) return; // guard double submit
    setSubmitted(true);
    setIsLoading(true);
    setError(null);

    try {
      console.log('Starting investment process...');
      // Pre-validate server-side to avoid on-chain failure from bad codes or limits
      {
        const preEndpoint = isRwa ? '/api/rwa/invest' : '/api/funds/invest';
        const precheckRes = await fetch(preEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fundId,
            investorWallet: wallet.publicKey.toString(),
            amount: investmentAmount,
            inviteCode: requiresInviteCode ? inviteCode.trim() : undefined,
            referralCode: referralCode ? referralCode.trim() : undefined,
            validateOnly: true,
          }),
        });
        const precheck = await precheckRes.json();
        if (!precheckRes.ok || !precheck.success) {
          throw new Error(precheck.error || 'Validation failed');
        }
      }
      
      // Make the deposit to the fund
      const signature = await solanaFundService.depositToFund(
        wallet, 
        fundId, 
        investmentAmount
      );

      console.log('Investment transaction signature:', signature);

  // Record the investment in the database (Funds vs RWA)
  const endpoint = isRwa ? '/api/rwa/invest' : '/api/funds/invest';
      console.log(`Recording investment in database via ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fundId,
          investorWallet: wallet.publicKey.toString(),
          amount: investmentAmount,
          signature,
          inviteCode: requiresInviteCode ? inviteCode.trim() : undefined,
          referralCode: referralCode ? referralCode.trim() : undefined,
          generateInviteCodesCount: canRequestInviteCodesCount ? Math.min(Math.max(requestCodes, 0), canRequestInviteCodesCount) : undefined
        }),
      });

      const result = await response.json();
      console.log('Investment API response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record investment');
      }

      if (result?.data?.inviteCodes?.length) {
        setGrantedCodes(result.data.inviteCodes);
      }
      if (onInvestmentComplete) {
        onInvestmentComplete(signature);
      }

      console.log('Investment completed successfully!');
      if (!result?.data?.inviteCodes?.length) {
        // For public or single_code investments, show post-invest share UI instead of closing immediately
        setUsedCode(requiresInviteCode ? inviteCode.trim().toUpperCase() : undefined);
        setInvestSuccess(true);
      }
      
    } catch (error) {
      console.error('=== ERROR INVESTING IN FUND ===');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      setError(error instanceof Error ? error.message : 'Failed to invest in fund');
    } finally {
      setIsLoading(false);
      setSubmitted(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
  <DialogContent className="sm:max-w-[520px] bg-[#0B0B0C] text-white border border-white/10 rounded-xl sm:rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-extrabold text-white">
              Invest in {fundName}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Add SOL to this {isRwa ? 'RWA product' : 'fund'} and receive proportional shares.
            </DialogDescription>
          </DialogHeader>
        </div>

        {error && (
          <div className="mx-4 sm:mx-6 mt-2 mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        {grantedCodes ? (
          <div className="px-4 sm:px-6 pb-6 sm:pb-7 space-y-4">
            <h3 className="text-lg font-semibold">Your invite codes</h3>
            <p className="text-sm text-white/60">Share these with friends. Each code can be used once.</p>
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] sm:text-xs font-mono">
              {grantedCodes.map(c => (<div key={c} className="px-2 py-1 bg-white/10 rounded text-center tracking-wider">{c}</div>))}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={() => navigator.clipboard.writeText(grantedCodes.join('\n'))} className="w-full sm:flex-1 h-11 rounded-full bg-brand-yellow text-brand-black text-sm font-semibold">Copy</button>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent([
                  `I just invested in ${fundName} using @DefundsFinance`,
                  `${grantedCodes.length === 1 ? 'Here is my invite code' : 'Here are my invite codes'} so you can invest too: ${grantedCodes.join(', ')}`,
                  `Be fast — only ${grantedCodes.length} ${grantedCodes.length === 1 ? 'code' : 'codes'}!`,
                  `${typeof window !== 'undefined' ? window.location.origin : ''}/Funds`
                ].join(' \n '))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:flex-1 h-11 rounded-full bg-[#1DA1F2] text-white text-sm font-semibold flex items-center justify-center hover:brightness-110"
              >
                Share on X
              </a>
              <button onClick={() => { setGrantedCodes(null); onClose(); }} className="w-full sm:flex-1 h-11 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15">Done</button>
            </div>
          </div>
        ) : investSuccess ? (
          <div className="px-4 sm:px-6 pb-6 sm:pb-7 space-y-4">
            <h3 className="text-lg font-semibold">Investment successful</h3>
            <p className="text-sm text-white/60">Share your investment so friends can join.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent([
                  `I just invested in ${fundName} using @DefundsFinance`,
                  requiresInviteCode && usedCode ? `Use this invite code to join: ${usedCode}` : undefined,
                  `${typeof window !== 'undefined' ? window.location.origin : ''}/Funds`
                ].filter(Boolean).join(' \n '))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:flex-1 h-11 rounded-full bg-[#1DA1F2] text-white text-sm font-semibold flex items-center justify-center hover:brightness-110"
              >
                Share on X
              </a>
              <button onClick={() => { setInvestSuccess(false); setUsedCode(undefined); onClose(); }} className="w-full sm:flex-1 h-11 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15">Done</button>
            </div>
          </div>
        ) : !wallet.connected ? (
          <div className="px-4 sm:px-6 pb-6 sm:pb-7 space-y-5 text-center">
            <p className="text-sm text-white/70">Connect your wallet to invest in this {isRwa ? 'product' : 'fund'}</p>
            <div className="flex justify-center">
              <WalletMultiButton className="!w-full sm:!w-auto !bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !font-semibold hover:!brightness-110 !transition" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-4 sm:px-6 pb-6 sm:pb-7">
            <div>
              <label className="block text-sm font-medium mb-1 text-white/70">Investment Amount (SOL)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '.');
                  // allow interim
                  if (/^\d*(?:\.\d*)?$/.test(raw) || raw === '') {
                    setAmount(raw);
                  }
                }}
                placeholder="0.1"
                className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white"
              />
              <p className="text-xs text-white/50 mt-1">Minimum investment: 0.001 SOL</p>
            </div>
            {requiresInviteCode && (
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Invite Code</label>
                <Input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                  placeholder="INVITE123"
                  className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white tracking-wider"
                  maxLength={10}
                />
                <p className="text-xs text-white/50 mt-1">Required for this product.</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 text-white/70">Referral Code (optional)</label>
              <Input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                placeholder="YOURFRIEND"
                className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white tracking-wider"
                maxLength={10}
              />
              <p className="text-xs text-white/50 mt-1">If you have a friend’s referral code, paste it here.</p>
            </div>
            {!!canRequestInviteCodesCount && (
              <div>
                <label className="block text-sm font-medium mb-1 text-white/70">Get invite codes for friends</label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={canRequestInviteCodesCount} value={requestCodes} onChange={(e) => setRequestCodes(Math.max(0, Math.min(Number(e.target.value || 0), canRequestInviteCodesCount)))} className="w-20 sm:w-24 rounded-lg bg-white/5 border border-white/15 text-sm" />
                  <span className="text-xs text-white/50">Request up to {canRequestInviteCodesCount} codes.</span>
                </div>
              </div>
            )}

            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-medium text-white mb-2">Investment Details</h4>
              <div className="space-y-1 text-xs text-white/70">
                <div className="flex justify-between">
                  <span>Fund ID:</span>
                  <span className="font-mono text-xs">{fundId.slice(0, 8)}...{fundId.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Wallet:</span>
                  <span className="font-mono text-xs">
                    {wallet.publicKey?.toString().slice(0, 8)}...{wallet.publicKey?.toString().slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span>{amount.replace(/,/g, '.')} SOL</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="w-full sm:flex-1 inline-flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/15 text-sm font-medium h-11 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Investing...' : `Invest ${amount ? amount.replace(/,/g, '.') : ''} SOL`}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
