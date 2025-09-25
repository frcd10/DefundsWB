'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundService } from '@/services/solana-fund.service';

interface InvestInFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  fundId: string;
  fundName: string;
  // If true, records the investment using the RWA API instead of Funds API
  isRwa?: boolean;
  onInvestmentComplete?: (signature: string) => void;
}

export function InvestInFundModal({ 
  isOpen, 
  onClose, 
  fundId, 
  fundName,
  isRwa = false,
  onInvestmentComplete 
}: InvestInFundModalProps) {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('0.1');
  const [submitted, setSubmitted] = useState(false);

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

    const investmentAmount = parseFloat(amount);
    if (isNaN(investmentAmount) || investmentAmount <= 0) {
      setError('Please enter a valid investment amount');
      return;
    }

  if (submitted) return; // guard double submit
  setSubmitted(true);
  setIsLoading(true);
    setError(null);

    try {
      console.log('Starting investment process...');
      
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
          signature
        }),
      });

      const result = await response.json();
      console.log('Investment API response:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to record investment');
      }

      if (onInvestmentComplete) {
        onInvestmentComplete(signature);
      }

      console.log('Investment completed successfully!');
      onClose();
      
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
      <DialogContent className="sm:max-w-[425px] bg-gray-900 border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Invest in {fundName}
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Add SOL to this fund and receive proportional shares
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-900/20 border border-red-700 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {!wallet.connected ? (
          <div className="space-y-4">
            <p className="text-gray-300 text-center">
              Connect your wallet to invest in this fund
            </p>
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Investment Amount (SOL)
              </label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.1"
                min="0.001"
                step="0.001"
                required
                className="bg-gray-800 border-gray-600 text-white"
              />
              <p className="text-xs text-gray-400 mt-1">
                Minimum investment: 0.001 SOL
              </p>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg">
              <h4 className="text-sm font-medium text-white mb-2">Investment Details</h4>
              <div className="space-y-1 text-xs text-gray-300">
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
                  <span>{amount} SOL</span>
                </div>
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
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={isLoading}
              >
                {isLoading ? 'Investing...' : 'Invest SOL'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
