'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useProgram } from '@/lib/hooks/useProgram';
import { TraderDashboard } from '@/components/trader/TraderDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TraderPage() {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const [vaults, setVaults] = useState<any[]>([]);
  const [selectedVault, setSelectedVault] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (publicKey && program) {
      loadTraderVaults();
    }
  }, [publicKey, program]);
  
  const loadTraderVaults = async () => {
    try {
      setLoading(true);
      const traderVaults = await program.account.vault.all([
        {
          memcmp: {
            offset: 8, // After discriminator
            bytes: publicKey!.toBase58(),
          },
        },
      ]);
      
      setVaults(traderVaults);
      if (traderVaults.length > 0 && !selectedVault) {
        setSelectedVault(traderVaults[0].publicKey.toString());
      }
    } catch (error) {
      console.error('Error loading vaults:', error);
    } finally {
      setLoading(false);
    }
  };
  
  if (!publicKey) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              Please connect your wallet to access the Trader Area
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center">Loading...</p>
      </div>
    );
  }
  
  if (vaults.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              You haven't created any vaults yet. Create a vault to start trading.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Trader Area</h1>
      
      {vaults.length > 1 ? (
        <Tabs value={selectedVault || ''} onValueChange={setSelectedVault}>
          <TabsList>
            {vaults.map((vault) => (
              <TabsTrigger key={vault.publicKey.toString()} value={vault.publicKey.toString()}>
                {vault.account.name}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {vaults.map((vault) => (
            <TabsContent key={vault.publicKey.toString()} value={vault.publicKey.toString()}>
              <TraderDashboard vaultId={vault.publicKey.toString()} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <TraderDashboard vaultId={vaults[0].publicKey.toString()} />
      )}
    </div>
  );
}
