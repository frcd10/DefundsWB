'use client';

import { useState } from 'react';
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

  const withdrawAmount = (currentValue * parseFloat(withdrawPercentage || '0')) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      
      // Make the withdrawal from the fund
      const signature = await solanaFundService.withdrawFromFund(
        wallet, 
        fundId, 
        withdrawPct
      );

      console.log('Withdrawal transaction signature:', signature);

      // Call the API to record the withdrawal
      const response = await fetch('/api/funds/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fundId,
          walletAddress: wallet.publicKey.toString(),
          sharePercentage: withdrawPct,
          signature,
          withdrawAmount
        }),
      });

      const result = await response.json();
      console.log('Withdrawal API response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record withdrawal');
      }

      if (onWithdrawComplete) {
        onWithdrawComplete(signature);
      }

      console.log('Withdrawal completed successfully!');
      onClose();
      
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
      <DialogContent className="sm:max-w-[425px] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Withdraw from {fundName}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Withdraw your share of the fund proportionally
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-900/20 border border-red-700 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-2">Your Position</h4>
            <div className="space-y-1 text-xs text-gray-300">
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
            <label className="block text-sm font-medium text-white mb-2">
              Withdrawal Percentage
            </label>
            <Input
              type="number"
              value={withdrawPercentage}
              onChange={(e) => setWithdrawPercentage(e.target.value)}
              placeholder="100"
              min="1"
              max="100"
              step="1"
              required
              className="bg-gray-800 border-gray-600 text-white"
            />
            <p className="text-xs text-gray-400 mt-1">
              Enter 100 to withdraw your entire position
            </p>
          </div>

          <div className="bg-gray-800 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-white mb-2">Withdrawal Details</h4>
            <div className="space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Withdraw:</span>
                <span>{withdrawPercentage}% of your position</span>
              </div>
              <div className="flex justify-between">
                <span>Amount:</span>
                <span className="text-green-400 font-bold">{withdrawAmount.toFixed(2)} SOL</span>
              </div>
              <div className="flex justify-between">
                <span>Remaining:</span>
                <span>{((100 - parseFloat(withdrawPercentage || '0')) * currentValue / 100).toFixed(2)} SOL</span>
              </div>
            </div>
                        <div className="mt-3 p-2 bg-blue-900/50 border border-blue-600 rounded">
              <p className="text-xs text-blue-300">
                💰 Real withdrawal: You can only withdraw from your own {userShares.toFixed(2)} shares (your portion of the fund).
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-600 text-white hover:bg-gray-800"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? 'Withdrawing...' : 'Withdraw SOL'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
