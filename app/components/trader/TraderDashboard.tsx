'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, ParsedAccountData } from '@solana/web3.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign } from 'lucide-react';
import { JupiterService } from '@/lib/services/jupiter.service';
import { useProgram } from '@/lib/hooks/useProgram';
import { toast } from 'sonner';
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction } from '@solana/spl-token';

declare global {
  interface Window {
    Jupiter?: any;
    solana?: any;
  }
}

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
  window.Jupiter?.init({
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

  const closeManagerZeroBalances = async () => {
    try {
      if (!publicKey) {
        toast.error('Connect your wallet first');
        return;
      }
  const connection = provider.connection;
      setLoading(true);
      toast.info('Scanning your token accounts for zero balances...');

      const resp = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const zeroAccounts = resp.value
        .filter((acc): acc is (typeof resp.value[number] & { account: { data: ParsedAccountData } }) => acc.account.data instanceof Object)
        .filter((acc: typeof resp.value[number] & { account: { data: ParsedAccountData } }) => {
          const info: any = acc.account.data.parsed.info;
          const amount = info.tokenAmount?.amount as string | undefined;
          const delegate = info.delegate as string | undefined;
          return amount === '0' && !delegate; // skip delegated accounts
        })
        .map((acc: typeof resp.value[number]) => acc.pubkey);

      if (zeroAccounts.length === 0) {
        toast.success('No zero-balance accounts to close');
        return;
      }

      // Chunk into batches to avoid tx size limits
      const BATCH_SIZE = 8;
      let closed = 0;
      for (let i = 0; i < zeroAccounts.length; i += BATCH_SIZE) {
        const slice = zeroAccounts.slice(i, i + BATCH_SIZE);
        const tx = new Transaction();
        slice.forEach((accPk: PublicKey) => {
          tx.add(createCloseAccountInstruction(accPk, publicKey, publicKey));
        });
        const sig = await (window as any).solana.signAndSendTransaction
          ? (async () => {
              // fallback for Phantom-style API if adapter not present
              tx.feePayer = publicKey;
              const { blockhash } = await connection.getLatestBlockhash();
              tx.recentBlockhash = blockhash;
              const signed = await (window as any).solana.signTransaction(tx);
              const raw = signed.serialize();
              return await connection.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
            })()
          : (async () => {
              // wallet-adapter path
              return await (provider.wallet as any).sendTransaction(tx, connection);
            })();
        await connection.confirmTransaction(sig, 'confirmed');
        closed += slice.length;
      }
      toast.success(`Requested closing ${closed} zero-balance accounts. Lamports returned to your wallet.`);
    } catch (e: any) {
      console.error('closeManagerZeroBalances error:', e);
      toast.error(e?.message || 'Failed to close zero-balance accounts');
    } finally {
      setLoading(false);
    }
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
            <Button variant="secondary" onClick={closeManagerZeroBalances} disabled={loading} className="w-full">
              Close manager zero-balance accounts
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
