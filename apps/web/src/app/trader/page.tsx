'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SwapPanel } from '../../components/trader/SwapPanel';
import { RwaPayoutPanel } from '../../components/trader/RwaPayoutPanel';
import { FundPayoutPanel } from '../../components/trader/FundPayoutPanel';

export default function TraderPage() {
  const wallet = useWallet();
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funds, setFunds] = useState<Array<Record<string, unknown>>>([]);
  const [rwas, setRwas] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    const run = async () => {
      if (!wallet.publicKey) {
        setEligible(false);
        setFunds([]);
        setRwas([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/trader/eligible?wallet=${wallet.publicKey.toString()}`);
        const data = await res.json();
        if (data.success) {
          setEligible(data.data.eligible);
          setFunds(data.data.funds || []);
          setRwas(data.data.rwas || []);
        } else {
          setEligible(false);
        }
      } catch {
        setEligible(false);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [wallet.publicKey]);

  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="container mx-auto px-4 py-12">
          <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700">
            <div className="py-10 px-6 flex flex-col items-center gap-4">
              <p className="text-sol-200">Connect your wallet to access the Trader Area.</p>
              <WalletMultiButton className="!bg-sol-accent !text-sol-900 !rounded-full !px-4 !py-2 !h-auto !text-sm hover:!brightness-110" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="container mx-auto px-4 py-12">
          <p className="text-sol-200">Loading...</p>
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="container mx-auto px-4 py-12">
          <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700">
            <div className="py-8 px-6">
              <p className="text-sol-200">Trader area is gated. Create a Fund or an RWA product to access.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold mb-6 text-sol-50">Trader Area</h1>

        <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 p-4">
          <Tabs defaultValue="swap">
            <TabsList className="bg-sol-900/50 border border-sol-700 rounded-xl p-1">
              <TabsTrigger value="swap" className="data-[state=active]:bg-sol-accent data-[state=active]:text-sol-900 rounded-lg px-4 py-2 text-sol-200">Swap</TabsTrigger>
              <TabsTrigger value="rwa" className="data-[state=active]:bg-sol-accent data-[state=active]:text-sol-900 rounded-lg px-4 py-2 text-sol-200">RWA Payout</TabsTrigger>
              <TabsTrigger value="funds" className="data-[state=active]:bg-sol-accent data-[state=active]:text-sol-900 rounded-lg px-4 py-2 text-sol-200">Funds Payout</TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="mt-4">
              <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 p-6">
                <SwapPanel funds={funds} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>

            <TabsContent value="rwa" className="mt-4">
              <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 p-6">
                <RwaPayoutPanel rwas={rwas} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>

            <TabsContent value="funds" className="mt-4">
              <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 p-6">
                <FundPayoutPanel funds={funds} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
