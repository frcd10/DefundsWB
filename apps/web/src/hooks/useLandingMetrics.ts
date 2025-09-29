"use client";
import { useEffect, useState } from 'react';

interface FundItem { tvl: number; investorCount: number; }
interface RwaItem { tvl: number; investorCount: number; }

interface MetricsState {
  loading: boolean;
  activeFunds: number;
  activeRwa: number;
  totalInvestors: number;
  totalTvl: number; // in SOL
  error?: string;
}

export function useLandingMetrics(): MetricsState {
  const [state, setState] = useState<MetricsState>({
    loading: true,
    activeFunds: 0,
    activeRwa: 0,
    totalInvestors: 0,
    totalTvl: 0,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [fundsRes, rwaRes] = await Promise.all([
          fetch('/api/funds/real?page=1&limit=200'),
          fetch('/api/rwa/real?page=1&limit=200')
        ]);
        if (!fundsRes.ok || !rwaRes.ok) throw new Error('Network error');
        const fundsJson = await fundsRes.json();
        const rwaJson = await rwaRes.json();

        const funds: FundItem[] = fundsJson?.data?.funds || [];
        const rwaItems: RwaItem[] = rwaJson?.data?.items || [];

        const activeFunds = funds.length;
        const activeRwa = rwaItems.length;
        const totalInvestors = [...funds, ...rwaItems].reduce((acc, f: any) => acc + (f.investorCount || 0), 0);
        const totalTvl = [...funds, ...rwaItems].reduce((acc, f: any) => acc + (f.tvl || 0), 0);

        if (cancelled) return;
        setState({ loading: false, activeFunds, activeRwa, totalInvestors, totalTvl });
      } catch (e: any) {
        if (cancelled) return;
        setState(prev => ({ ...prev, loading: false, error: e?.message || 'Failed to load metrics' }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
