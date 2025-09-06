'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WithdrawalService, WithdrawalProgress } from '@/lib/services/withdrawal.service';
import { useProgram } from '@/lib/hooks/useProgram';
import { PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  vaultId: string;
  userShares: number;
  onSuccess: () => void;
}

export function WithdrawModal({ open, onClose, vaultId, userShares, onSuccess }: WithdrawModalProps) {
  const { program, provider } = useProgram();
  const [sharesToWithdraw, setSharesToWithdraw] = useState(0);
  const [fees, setFees] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<WithdrawalProgress | null>(null);
  
  useEffect(() => {
    if (sharesToWithdraw > 0 && program) {
      calculateFees();
    }
  }, [sharesToWithdraw]);
  
  const calculateFees = async () => {
    try {
      const withdrawalService = new WithdrawalService(program, provider.connection, provider);
      const vaultPubkey = new PublicKey(vaultId);
      const calculatedFees = await withdrawalService.calculateWithdrawalFees(
        vaultPubkey,
        sharesToWithdraw
      );
      setFees(calculatedFees);
    } catch (error) {
      console.error('Error calculating fees:', error);
    }
  };
  
  const handleWithdraw = async () => {
    if (!program || sharesToWithdraw <= 0) return;
    
    try {
      setLoading(true);
      const withdrawalService = new WithdrawalService(program, provider.connection, provider);
      const vaultPubkey = new PublicKey(vaultId);
      
      await withdrawalService.initiateWithdrawal(
        vaultPubkey,
        sharesToWithdraw,
        (withdrawalProgress) => {
          setProgress(withdrawalProgress);
        }
      );
      
      toast.success('Withdrawal completed successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast.error('Withdrawal failed. Please try again.');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };
  
  const getProgressPercentage = () => {
    if (!progress) return 0;
    if (progress.totalPositions === 0) return 0;
    return (progress.positionsLiquidated / progress.totalPositions) * 100;
  };
  
  const getStatusMessage = () => {
    if (!progress) return '';
    switch (progress.status) {
      case 'initiating':
        return 'Initiating withdrawal...';
      case 'liquidating':
        return `Liquidating positions (${progress.positionsLiquidated}/${progress.totalPositions})...`;
      case 'finalizing':
        return 'Finalizing withdrawal...';
      case 'completed':
        return 'Withdrawal completed!';
      case 'failed':
        return 'Withdrawal failed';
      default:
        return '';
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Withdraw from Vault</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Input */}
          <div>
            <label className="text-sm font-medium">Shares to Withdraw</label>
            <Input
              type="number"
              value={sharesToWithdraw}
              onChange={(e) => setSharesToWithdraw(Number(e.target.value))}
              max={userShares}
              min={0}
              placeholder="Enter shares amount"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Available: {userShares} shares
            </p>
          </div>
          
          {/* Fee Breakdown */}
          {fees && (
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="font-medium">Fee Breakdown</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Estimated Received:</span>
                  <span className="font-medium">{fees.estimatedReceived.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Performance Fee:</span>
                  <span>{fees.performanceFee.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform Fee (1%):</span>
                  <span>{fees.platformFee.toFixed(4)} SOL</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Trader Receives:</span>
                  <span>{fees.traderReceives.toFixed(4)} SOL</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Progress */}
          {progress && (
            <div className="space-y-2">
              <Progress value={getProgressPercentage()} />
              <p className="text-sm text-center text-muted-foreground">
                {getStatusMessage()}
              </p>
            </div>
          )}
          
          {/* Warning */}
          <Alert>
            <AlertDescription>
              This will automatically liquidate your proportional share of all vault positions.
              Multiple transactions may be required. You will pay all transaction fees.
            </AlertDescription>
          </Alert>
          
          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={loading || sharesToWithdraw <= 0 || sharesToWithdraw > userShares}
              className="flex-1"
            >
              {loading ? 'Processing...' : 'Withdraw'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
