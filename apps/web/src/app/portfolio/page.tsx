'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@/components/ui/button';
import { WithdrawFromFundModal } from '@/components/WithdrawFromFundModal';

interface PortfolioPosition {
  fundId: string;
  fundName: string;
  fundType: string;
  sharePercentage: number;
  userShares: number;
  totalShares: number;
  currentValue: number;
  initialInvestment: number;
  totalWithdrawals: number;
  lastUpdated: string;
  fundPnlPct?: number | null;
}

interface PortfolioData {
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalPnL: number;
  totalPnLPercentage: number;
  activeFunds: number;
  positions: PortfolioPosition[];
}

export default function PortfolioPage() {
  const wallet = useWallet();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<PortfolioPosition | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchPortfolio = useCallback(async () => {
    if (!wallet.publicKey) {
      setPortfolio(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching portfolio for wallet:', wallet.publicKey.toString());
      
      const response = await fetch(`/api/portfolio?walletAddress=${wallet.publicKey.toString()}&ts=${Date.now()}` , { cache: 'no-store' });
      const data = await response.json();

      console.log('Portfolio response:', data);

      if (data.success) {
        setPortfolio(data.data);
        setLastRefreshedAt(data.data?.serverTimestamp || new Date().toISOString());
      } else {
        console.error('Portfolio fetch failed:', data.error);
        setPortfolio(null);
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      setPortfolio(null);
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey]);  

  // Debounced/safe refetch helper to coalesce rapid duplicate triggers
  const safeFetchPortfolio = useCallback(() => {
    const now = Date.now();
    // Skip if we fetched very recently (< 1000ms)
    if (now - lastFetchRef.current < 1000) return;
    lastFetchRef.current = now;
    fetchPortfolio();
  }, [fetchPortfolio]);

  useEffect(() => {
    // Reset guard when wallet changes so first fetch is not blocked
    lastFetchRef.current = 0;
    safeFetchPortfolio();
  }, [wallet.publicKey, safeFetchPortfolio]);

  // Refetch when the window gains focus or the tab becomes visible
  useEffect(() => {
    const onFocus = () => safeFetchPortfolio();
    const onVisibility = () => { if (document.visibilityState === 'visible') safeFetchPortfolio(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [safeFetchPortfolio]);

  const handleWithdraw = (position: PortfolioPosition) => {
    console.log('Opening withdraw modal for position:', position);
    setSelectedPosition(position);
    setShowWithdrawModal(true);
  };

  const handleWithdrawComplete = (signature: string) => {
    console.log('Withdrawal completed with signature:', signature);
    // Refresh portfolio data after withdrawal
    fetchPortfolio();
    setShowWithdrawModal(false);
    setSelectedPosition(null);
  };

  if (!wallet.connected) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8">Portfolio</h1>
            <p className="text-lg text-white/70 mb-8">
              Connect your wallet to view your fund positions and manage your investments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8">Portfolio</h1>
            <p className="text-lg text-white/70">Loading your portfolio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8">Portfolio</h1>
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 px-6 py-4 rounded-xl max-w-md mx-auto">
              <p>Error: {error}</p>
            </div>
            <Button 
              onClick={fetchPortfolio} 
              className="mt-4 rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition px-6"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolio || portfolio.positions.length === 0) {
    return (
      <div className="min-h-screen bg-brand-black text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8">Portfolio</h1>
            <p className="text-lg text-white/70 mb-3">
              You don&apos;t have any positions yet.
            </p>
            <p className="text-sm text-white/50 mb-8">
              Start by creating a fund or investing in existing funds to build your portfolio.
            </p>
            <Button 
              onClick={() => window.location.href = '/Funds'} 
              className="rounded-full bg-brand-yellow text-brand-black font-semibold hover:brightness-110 transition px-8 py-4"
            >
              Explore Funds
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-extrabold">Your Portfolio</h1>
          <Button onClick={fetchPortfolio} className="rounded-full bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2">Refresh</Button>
        </div>
        
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-12">
          <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
            <h3 className="text-sm font-medium text-white/70 mb-2">Total Value</h3>
            <p className="text-2xl font-bold text-emerald-400">
              {portfolio.totalValue.toFixed(4)} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
            <h3 className="text-sm font-medium text-white/70 mb-2">Total Invested</h3>
            <p className="text-2xl font-bold text-white">
              {portfolio.totalInvested.toFixed(4)} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
            <h3 className="text-sm font-medium text-white/70 mb-2">Total Withdraw</h3>
            <p className="text-2xl font-bold text-orange-400">
              {portfolio.totalWithdrawn?.toFixed(4) || '0.0000'} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
            <h3 className="text-sm font-medium text-white/70 mb-2">P&L</h3>
            <p className={`text-2xl font-bold ${portfolio.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {portfolio.totalPnL >= 0 ? '+' : ''}{portfolio.totalPnL.toFixed(4)} SOL
              <span className="text-sm ml-2">
                ({portfolio.totalPnLPercentage >= 0 ? '+' : ''}{portfolio.totalPnLPercentage.toFixed(2)}%)
              </span>
            </p>
            <p className="text-xs text-white/50 mt-1">
              Invested - Value + Withdrawn
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-sm border border-white/10">
            <h3 className="text-sm font-medium text-white/70 mb-2">Active Funds</h3>
            <p className="text-2xl font-bold text-sky-400">
              {portfolio.activeFunds}
            </p>
          </div>
        </div>

  {/* Positions Table (Funds) */}
        <div className="rounded-2xl bg-brand-surface/70 backdrop-blur-sm border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Fund Positions</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-brand-surface">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Fund
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Ownership
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Current Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Invested
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Withdrawn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    P&L
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-white/60 tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {portfolio.positions.map((position) => (
                  <tr key={position.fundId} className="group hover:bg-brand-yellow/5 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-white">{position.fundName}</p>
                        <div className="text-xs text-white/50 flex items-center gap-2">
                          <span>{position.fundId.slice(0, 8)}...</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(position.fundId)}
                            className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/70"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-yellow text-brand-black">
                        {position.fundType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-white">{position.sharePercentage.toFixed(2)}%</p>
                        <p className="text-xs text-white/50">
                          {position.userShares.toFixed(2)} / {position.totalShares.toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-white">{position.currentValue.toFixed(4)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-white">{position.initialInvestment.toFixed(4)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-orange-400">{position.totalWithdrawals.toFixed(4)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {(() => {
                          // Calculate P&L: Current Value + Withdrawn - Invested
                          const pnl = position.currentValue + position.totalWithdrawals - position.initialInvestment;
                          // Prefer fund cumulative PnL % from index (matches Funds page); fallback to personal PnL %
                          const personalPct = position.initialInvestment > 0 
                            ? (pnl / position.initialInvestment) * 100 
                            : 0;
                          const pnlPercentage = (typeof position.fundPnlPct === 'number' && Number.isFinite(position.fundPnlPct))
                            ? position.fundPnlPct
                            : personalPct;
                          
                          return (
                            <>
          <p className={`text-sm font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} SOL
                              </p>
          <p className={`text-xs ${pnlPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        onClick={() => handleWithdraw(position)}
        className="rounded-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-xs font-semibold"
                      >
                        Withdraw
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RWA section removed from portfolio page */}

        {/* Last Updated */}
        <div className="text-center mt-8">
          <p className="text-sm text-white/50">Portfolio last updated: {lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Withdraw Modal */}
      {selectedPosition && (
        <WithdrawFromFundModal
          isOpen={showWithdrawModal}
          onClose={() => {
            setShowWithdrawModal(false);
            setSelectedPosition(null);
          }}
          fundId={selectedPosition.fundId}
          fundName={selectedPosition.fundName}
          userShares={selectedPosition.userShares}
          totalShares={selectedPosition.totalShares}
          sharePercentage={selectedPosition.sharePercentage}
          currentValue={selectedPosition.currentValue}
          onWithdrawComplete={handleWithdrawComplete}
        />
      )}
    </div>
  );
}
