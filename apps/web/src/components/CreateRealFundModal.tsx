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
    isPublic: true,
    initialDeposit: 1.0
  });
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
  <DialogContent className="sm:max-w-[560px] bg-[#0B0B0C] text-white border border-white/10 rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_8px_40px_-4px_rgba(0,0,0,0.65)] p-0 overflow-hidden">
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
  <div className="space-y-5 px-6 pb-7">
          {!wallet.connected ? (
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

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                  className="h-4 w-4 accent-brand-yellow"
                />
                <label htmlFor="isPublic" className="text-sm text-white/70">Public fund (anyone can invest)</label>
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
    </Dialog>
  );
}
