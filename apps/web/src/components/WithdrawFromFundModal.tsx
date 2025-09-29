'use client';

import { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundServiceModular as solanaFundService } from '@/services/solanaFund';

interface WithdrawFromFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  fundId: string;
  fundName: string;
  userShares: number;
  totalShares: number;
  sharePercentage: number;
  currentValue: number;
  onWithdrawComplete?: (signature: string) => void;
}

export function WithdrawFromFundModal({ 
  isOpen, 
  onClose, 
  fundId, 
  fundName,
  userShares,
  totalShares,
  sharePercentage,
  currentValue,
  onWithdrawComplete 
}: WithdrawFromFundModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawPercentage, setWithdrawPercentage] = useState('100');
  const [submitted, setSubmitted] = useState(false);

  // Determine cluster (best-effort) for disabling withdrawals off mainnet
  const cluster = useMemo(() => {
    const c = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || '').toLowerCase();
    if (c === 'mainnet' || c === 'mainnet-beta') return 'mainnet';
    return 'devnet'; // treat anything else as non-mainnet for gating
  }, []);

  const withdrawalsEnabled = cluster === 'mainnet';

  const withdrawAmount = (currentValue * parseFloat(withdrawPercentage || '0')) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawalsEnabled) {
      setError('Withdrawals will be enabled when the protocol launches on mainnet.');
      return;
    }
    
    console.log('=== WITHDRAWAL ATTEMPT ===');
    console.log('Fund ID:', fundId);
    console.log('Fund Name:', fundName);
    console.log('Withdraw Percentage:', withdrawPercentage, '%');
    console.log('Withdraw Amount:', withdrawAmount, 'SOL');
    console.log('User Shares:', userShares, '/', totalShares);
    console.log('Wallet connected:', !!wallet.connected);
    console.log('Wallet public key:', wallet.publicKey?.toString());

    if (!wallet.connected || !wallet.publicKey) {
      setError('Please connect your wallet');
      return;
    }

    const withdrawPct = parseFloat(withdrawPercentage);
    if (isNaN(withdrawPct) || withdrawPct <= 0 || withdrawPct > 100) {
      setError('Please enter a valid withdrawal percentage (1-100)');
      return;
    }

    setIsLoading(true);
  if (submitted) return; // guard double submit
  setSubmitted(true);
    setError(null);

    try {
      console.log('Starting withdrawal process...');
      
      // (Disabled) Real withdrawal logic removed for non-mainnet environment
      setError('Withdrawals are disabled until mainnet launch.');
      
    } catch (error) {
      console.error('=== ERROR WITHDRAWING FROM FUND ===');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      setError(error instanceof Error ? error.message : 'Failed to withdraw from fund');
    } finally {
      setIsLoading(false);
      setSubmitted(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-yellow via-brand-yellow/60 to-transparent" />
        <div className="px-6 pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-2xl font-extrabold text-white">
              Withdraw from {fundName}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              Withdraw a percentage of your position. {withdrawalsEnabled ? '' : 'Currently disabled off mainnet.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {error && (
          <div className="mx-6 mt-2 mb-4 p-3 bg-red-900/30 border border-red-700 rounded-md text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 px-6 pb-7">
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-medium text-white mb-2">Your Position</h4>
            <div className="space-y-1 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Your Shares:</span>
                <span>{userShares.toFixed(2)} / {totalShares.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Ownership:</span>
                <span>{sharePercentage.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Current Value:</span>
                <span>{currentValue.toFixed(2)} SOL</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-white/70">Withdrawal Percentage</label>
            <Input
              type="number"
              value={withdrawPercentage}
              onChange={(e) => setWithdrawPercentage(e.target.value)}
              placeholder="100"
              min="1"
              max="100"
              step="1"
              required
              className="w-full rounded-lg bg-white/5 border border-white/15 focus:border-brand-yellow/60 focus:ring-0 text-sm placeholder-white/30 text-white"
            />
            <p className="text-xs text-white/50 mt-1">Enter 100 to withdraw your entire position</p>
          </div>

          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-medium text-white mb-2">Withdrawal Details</h4>
            <div className="space-y-1 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Withdraw:</span>
                <span>{withdrawPercentage}% of your position</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="text-brand-yellow font-semibold">{withdrawAmount.toFixed(2)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span>{((100 - parseFloat(withdrawPercentage || '0')) * currentValue / 100).toFixed(2)} SOL</span>
              </div>
            </div>
            {!withdrawalsEnabled && (
              <div className="mt-3 p-2 bg-white/5 border border-white/10 rounded">
                <p className="text-xs text-white/60">
                  🔒 Withdrawals are disabled in the current cluster. They will be enabled on mainnet launch. As withdrawals will trigger also some trading activities, we cant reproduce it here
                </p>
              </div>
            )}
          </div>

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
              disabled={isLoading || !withdrawalsEnabled}
              className="flex-1 inline-flex items-center justify-center rounded-full bg-brand-yellow text-brand-black font-semibold h-11 shadow-[0_3px_18px_rgba(246,210,58,0.35)] hover:brightness-110 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {withdrawalsEnabled ? (isLoading ? 'Withdrawing...' : 'Withdraw SOL') : 'Coming Soon'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
