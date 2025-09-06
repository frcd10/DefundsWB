'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { solanaFundService, CreateFundParams } from '@/services/solana-fund.service';
import { FundType } from '@/data/mockFunds';

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
    isPublic: true,
    initialDeposit: 1.0
  });

  const parseNumberInput = (value: string): number => {
    // Accept both "," and "." as decimal separators
    const normalized = value.replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
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
        isPublic: formData.isPublic,
        initialDeposit: formData.initialDeposit
      };

      console.log('Creating fund with params:', params);
      const result = await solanaFundService.createFund(wallet, params);
      console.log('Solana service result:', result);
      
      // Store fund data in backend
      const requestBody = {
        fundId: result.fundId,
        manager: wallet.publicKey.toString(),
        name: formData.name,
        description: formData.description,
        fundType: formData.fundType,
        performanceFee: formData.performanceFee,
        maxCapacity: formData.maxCapacity,
        isPublic: formData.isPublic,
        signature: result.signature,
        initialDeposit: formData.initialDeposit
      };
      
      console.log('Sending request to backend:', requestBody);
      
      const response = await fetch('/api/funds/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Backend response status:', response.status);
      console.log('Backend response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Backend error response:', errorData);
        throw new Error(errorData.error || 'Failed to save fund to database');
      }

      const responseData = await response.json();
      console.log('Backend success response:', responseData);

      // Success!
      onFundCreated?.(result.fundId);
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        fundType: 'Long Only',
        performanceFee: 20,
        maxCapacity: 100,
        isPublic: true,
        initialDeposit: 1.0
      });

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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Real Fund on Solana</DialogTitle>
          <DialogDescription>
            Create a real fund on Solana devnet. You&apos;ll need SOL in your wallet for transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!wallet.connected ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">Connect your wallet to create a fund</p>
              <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Fund Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Alpha Trading Fund"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md resize-none"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your fund's strategy..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fund Type</label>
                <select
                  className="w-full px-3 py-2 border rounded-md"
                  value={formData.fundType}
                  onChange={(e) => setFormData(prev => ({ ...prev, fundType: e.target.value as FundType }))}
                >
                  {FUND_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Performance Fee (%)</label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    value={formData.performanceFee}
                    onChange={(e) => setFormData(prev => ({ ...prev, performanceFee: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Max Capacity (SOL)</label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.maxCapacity}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxCapacity: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Initial Deposit (SOL)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.initialDeposit}
                  onChange={(e) => setFormData(prev => ({ ...prev, initialDeposit: parseNumberInput(e.target.value) }))}
                />
                <p className="text-xs text-gray-500 mt-1">
                  You&apos;ll own 100% of the fund initially. Others can invest later.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Fund creation requires two signatures: 1) a small rent fee to create the fund accounts (~0.006–0.010 SOL), 2) your initial deposit (the SOL amount above).
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                />
                <label htmlFor="isPublic" className="text-sm">Public fund (anyone can invest)</label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? 'Creating...' : 'Create Fund'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
