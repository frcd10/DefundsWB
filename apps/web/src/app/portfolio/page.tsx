'use client';

import { useState, useEffect, useCallback } from 'react';
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
}

interface PortfolioData {
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalPnL: number;
  totalPnLPercentage: number;
  activeFunds: number;
  positions: PortfolioPosition[];
  rwaPositions?: RwaPosition[];
}

interface RwaPosition {
  fundId: string;
  name: string;
  type: string;
  invested: number;
  received: number;
  ownership: number;
  userShares: number;
  totalShares: number;
  lastUpdated: string;
}

export default function PortfolioPage() {
  const wallet = useWallet();
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<PortfolioPosition | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    if (!wallet.publicKey) {
      setPortfolio(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      console.log('Fetching portfolio for wallet:', wallet.publicKey.toString());
      
      const response = await fetch(`/api/portfolio?walletAddress=${wallet.publicKey.toString()}`);
      const data = await response.json();

      console.log('Portfolio response:', data);

      if (data.success) {
        setPortfolio(data.data);
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
  }, [wallet.publicKey]);  useEffect(() => {
    fetchPortfolio();
  }, [wallet.publicKey, fetchPortfolio]);

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
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8 text-sol-50">Portfolio</h1>
            <p className="text-lg text-sol-200 mb-8">
              Connect your wallet to view your fund positions and manage your investments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8 text-sol-50">Portfolio</h1>
            <p className="text-lg text-sol-200">Loading your portfolio...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8 text-sol-50">Portfolio</h1>
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-6 py-4 rounded-xl max-w-md mx-auto">
              <p>Error: {error}</p>
            </div>
            <Button 
              onClick={fetchPortfolio} 
              className="mt-4 rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:scale-105 transition"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolio || (portfolio.positions.length === 0 && (!portfolio.rwaPositions || portfolio.rwaPositions.length === 0))) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold mb-8 text-sol-50">Portfolio</h1>
            <p className="text-lg text-sol-200 mb-3">
              You don&apos;t have any positions yet.
            </p>
            <p className="text-sm text-sol-300 mb-8">
              Start by creating a fund or investing in existing funds/RWA products to build your portfolio.
            </p>
            <Button 
              onClick={() => window.location.href = '/Funds'} 
              className="rounded-xl bg-gradient-to-r from-sol-accent to-cyan-400 text-sol-900 font-semibold hover:scale-105 transition"
            >
              Explore Funds
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sol-900 via-sol-850 to-sol-800 text-white">
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h1 className="text-4xl font-extrabold mb-8 text-center text-sol-50">Your Portfolio</h1>
        
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-12">
          <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
            <h3 className="text-sm font-medium text-sol-200 mb-2">Total Value</h3>
            <p className="text-2xl font-bold text-green-400">
              {portfolio.totalValue.toFixed(2)} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
            <h3 className="text-sm font-medium text-sol-200 mb-2">Total Invested</h3>
            <p className="text-2xl font-bold text-sol-50">
              {portfolio.totalInvested.toFixed(2)} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
            <h3 className="text-sm font-medium text-sol-200 mb-2">Total Withdraw</h3>
            <p className="text-2xl font-bold text-orange-400">
              {portfolio.totalWithdrawn?.toFixed(2) || '0.00'} SOL
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
            <h3 className="text-sm font-medium text-sol-200 mb-2">P&L</h3>
            <p className={`text-2xl font-bold ${portfolio.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {portfolio.totalPnL >= 0 ? '+' : ''}{portfolio.totalPnL.toFixed(2)} SOL
              <span className="text-sm ml-2">
                ({portfolio.totalPnLPercentage >= 0 ? '+' : ''}{portfolio.totalPnLPercentage.toFixed(2)}%)
              </span>
            </p>
            <p className="text-xs text-sol-300 mt-1">
              Invested - Value + Withdrawn
            </p>
          </div>
          <div className="rounded-2xl p-6 bg-sol-800/60 backdrop-blur border border-sol-700">
            <h3 className="text-sm font-medium text-sol-200 mb-2">Active Funds</h3>
            <p className="text-2xl font-bold text-blue-400">
              {portfolio.activeFunds}
            </p>
          </div>
        </div>

  {/* Positions Table (Funds) */}
        <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 overflow-hidden">
          <div className="p-6 border-b border-sol-700">
            <h2 className="text-xl font-bold text-sol-50">Fund Positions</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-sol-800/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Fund
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Ownership
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Current Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Invested
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Withdrawn
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    P&L
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sol-700">
                {portfolio.positions.map((position) => (
                  <tr key={position.fundId} className="hover:bg-sol-800/40">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-semibold text-sol-50">{position.fundName}</p>
                        <p className="text-xs text-sol-300">{position.fundId.slice(0, 8)}...</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sol-accent text-sol-900">
                        {position.fundType}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-sol-50">{position.sharePercentage.toFixed(2)}%</p>
                        <p className="text-xs text-sol-300">
                          {position.userShares.toFixed(2)} / {position.totalShares.toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-sol-50">{position.currentValue.toFixed(2)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-sol-50">{position.initialInvestment.toFixed(2)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-orange-400">{position.totalWithdrawals.toFixed(2)} SOL</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {(() => {
                          // Calculate P&L: Current Value + Withdrawn - Invested
                          const pnl = position.currentValue + position.totalWithdrawals - position.initialInvestment;
                          const pnlPercentage = position.initialInvestment > 0 
                            ? (pnl / position.initialInvestment) * 100 
                            : 0;
                          
                          return (
                            <>
                              <p className={`text-sm font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} SOL
                              </p>
                              <p className={`text-xs ${pnlPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                        className="rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm"
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

        {/* RWA Investments Table */}
        <div className="rounded-2xl bg-sol-800/60 backdrop-blur border border-sol-700 overflow-hidden mt-10">
          <div className="p-6 border-b border-sol-700">
            <h2 className="text-xl font-bold text-sol-50">RWA Investments</h2>
            <p className="text-xs text-sol-300 mt-1">Shows your ownership, total invested, and payments received.</p>
          </div>

          {portfolio.rwaPositions && portfolio.rwaPositions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-sol-800/60">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Ownership</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Invested</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sol-300 uppercase tracking-wider">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sol-700">
                  {portfolio.rwaPositions.map((p) => (
                    <tr key={p.fundId} className="hover:bg-sol-800/40">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-semibold text-sol-50">{p.name}</p>
                          <p className="text-xs text-sol-300">{p.fundId.slice(0, 8)}...</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sol-accent text-sol-900">
                          {p.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-sol-50">{(p.ownership || 0).toFixed(2)}%</p>
                          <p className="text-xs text-sol-300">{(p.userShares || 0).toFixed(2)} / {(p.totalShares || 0).toFixed(2)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-medium text-sol-50">{p.invested.toFixed(2)} SOL</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-sm font-medium text-green-400">{(p.received || 0).toFixed(2)} SOL</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-sol-300">No RWA investments yet.</div>
          )}
        </div>

        {/* Last Updated */}
        <div className="text-center mt-8">
          <p className="text-sm text-sol-300">
            Portfolio last updated: {new Date().toLocaleString()}
          </p>
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
