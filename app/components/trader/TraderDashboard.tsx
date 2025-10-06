'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign } from 'lucide-react';
import { JupiterService } from '@/lib/services/jupiter.service';
import { useProgram } from '@/lib/hooks/useProgram';
import { toast } from 'sonner';

interface Position {
  mint: string;
  symbol: string;
  amount: number;
  value: number;
  pnl: number;
  pnlPercentage: number;
}

interface TraderDashboardProps {
  vaultId: string;
}

export function TraderDashboard({ vaultId }: TraderDashboardProps) {
  const { publicKey } = useWallet();
  const { program, provider } = useProgram();
  const [positions, setPositions] = useState<Position[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [totalPnL, setTotalPnL] = useState(0);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (program && vaultId) {
      loadPositions();
    }
  }, [program, vaultId]);
  
  const loadPositions = async () => {
    try {
      setLoading(true);
      const vaultPubkey = new PublicKey(vaultId);
      const vault = await program.account.vault.fetch(vaultPubkey);
      
      // Check if current user is the trader
      if (vault.trader.toString() !== publicKey?.toString()) {
        toast.error('You are not authorized to trade this vault');
        return;
      }
      
      const jupiterService = new JupiterService(provider.connection);
      const vaultPositions = [];
      let totalVal = 0;
      let totalProfit = 0;
      
      for (const positionMint of vault.positions) {
        const [positionPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('position'), vaultPubkey.toBuffer(), positionMint.toBuffer()],
          program.programId
        );
        
        const position = await program.account.vaultPosition.fetch(positionPda);
        const currentPrice = await jupiterService.getTokenPrices([positionMint.toString()]);
        const currentValue = position.amount * (currentPrice.get(positionMint.toString()) || 0);
        const entryValue = position.amount * position.entryPriceSol;
        const pnl = currentValue - entryValue;
        const pnlPercentage = (pnl / entryValue) * 100;
        
        vaultPositions.push({
          mint: positionMint.toString(),
          symbol: 'TOKEN', // You'd fetch actual symbol
          amount: position.amount,
          value: currentValue,
          pnl,
          pnlPercentage,
        });
        
        totalVal += currentValue;
        totalProfit += pnl;
      }
      
      setPositions(vaultPositions);
      setTotalValue(totalVal);
      setTotalPnL(totalProfit);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast.error('Failed to load positions');
    } finally {
      setLoading(false);
    }
  };
  
  const handleTrade = () => {
    // Open Jupiter Terminal or custom trade modal
    window.Jupiter.init({
      displayMode: 'integrated',
      integratedTargetId: 'jupiter-terminal',
  endpoint: (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta') ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com',
      formProps: {
        fixedInputMint: false,
        fixedOutputMint: false,
        initialAmount: '1000000000', // 1 SOL in lamports
      },
    });
  };
  
  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalValue.toFixed(4)} SOL</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)} SOL
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{positions.length}</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Trading Interface */}
      <Card>
        <CardHeader>
          <CardTitle>Trading</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Button onClick={handleTrade} className="w-full">
              Open Trading Terminal
            </Button>
            <div id="jupiter-terminal" className="min-h-[500px]" />
          </div>
        </CardContent>
      </Card>
      
      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Token</th>
                  <th className="text-right p-2">Amount</th>
                  <th className="text-right p-2">Value (SOL)</th>
                  <th className="text-right p-2">P&L</th>
                  <th className="text-right p-2">P&L %</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => (
                  <tr key={position.mint} className="border-b">
                    <td className="p-2">{position.symbol}</td>
                    <td className="text-right p-2">{position.amount.toFixed(4)}</td>
                    <td className="text-right p-2">{position.value.toFixed(4)}</td>
                    <td className={`text-right p-2 ${position.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.pnl >= 0 ? '+' : ''}{position.pnl.toFixed(4)}
                    </td>
                    <td className={`text-right p-2 ${position.pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {position.pnlPercentage >= 0 ? '+' : ''}{position.pnlPercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
