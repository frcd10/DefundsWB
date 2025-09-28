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
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-12 px-6 flex flex-col items-center gap-4">
              <p className="text-white/70">Connect your wallet to access the Trader Area.</p>
              <WalletMultiButton className="!bg-brand-yellow !text-brand-black !rounded-full !px-6 !py-3 !h-auto !text-sm hover:!brightness-110 !font-semibold" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    );
  }

  if (!eligible) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="py-10 px-6">
              <p className="text-white/70">Trader area is gated. Create a Fund or an RWA product to access.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold mb-6">Trader Area</h1>

        <div className="rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 p-4">
          <Tabs defaultValue="swap">
            <TabsList className="bg-black/40 border border-white/10 rounded-xl p-1">
              <TabsTrigger value="swap" className="data-[state=active]:bg-brand-yellow data-[state=active]:text-brand-black rounded-lg px-4 py-2 text-white/70 data-[state=inactive]:hover:bg-white/5 transition">Swap</TabsTrigger>
              <TabsTrigger value="rwa" className="data-[state=active]:bg-brand-yellow data-[state=active]:text-brand-black rounded-lg px-4 py-2 text-white/70 data-[state=inactive]:hover:bg-white/5 transition">RWA Payout</TabsTrigger>
              <TabsTrigger value="funds" className="data-[state=active]:bg-brand-yellow data-[state=active]:text-brand-black rounded-lg px-4 py-2 text-white/70 data-[state=inactive]:hover:bg-white/5 transition">Funds Payout</TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="mt-4">
              <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
                <SwapPanel funds={funds} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>

            <TabsContent value="rwa" className="mt-4">
              <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
                <RwaPayoutPanel rwas={rwas} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>

            <TabsContent value="funds" className="mt-4">
              <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6">
                <FundPayoutPanel funds={funds} managerWallet={wallet.publicKey!.toString()} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
