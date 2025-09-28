'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
// Adjusted relative imports (no path alias resolution in this package scope)
import { useProgram } from '../lib/hooks/useProgram';
import { TraderDashboard } from '../components/trader/TraderDashboard';

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
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 text-center">
            <p className="text-white/70">Please connect your wallet to access the Trader Area</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <p className="text-white/70 text-center">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (vaults.length === 0) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 text-center">
            <p className="text-white/70">You haven't created any vaults yet. Create a vault to start trading.</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold mb-6">Trader Area</h1>
        {vaults.length > 1 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {vaults.map((vault) => {
              const id = vault.publicKey.toString();
              const active = id === selectedVault;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedVault(id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${active ? 'bg-brand-yellow text-brand-black' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  {vault.account.name || id.slice(0,6)}
                </button>
              );
            })}
          </div>
        )}
        <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
          <TraderDashboard vaultId={(selectedVault || vaults[0].publicKey.toString())} />
        </div>
      </div>
    </div>
  );
}
