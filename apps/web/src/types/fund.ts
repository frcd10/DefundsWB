// UI fund types independent of mock data

export type FundType =
  | 'Memes'
  | 'Arbitrage'
  | 'Leverage Futures'
  | 'Long Biased'
  | 'Long Only'
  | 'Sniper'
  | 'Quantitative'
  | 'BTC only'
  | 'ETH only'
  | 'SOL only'
  | 'BIG 3 only'
  | 'Yield Farming'
  | 'FREE'
  | 'On Chain Stocks Only';

export interface PerformancePoint {
  date: string;
  nav: number;
  pnl?: number;
  pnlPercentage?: number;
}

export interface FundStats {
  total: number;
  wins: number;
  losses: number;
  avgWinPct: number;
  avgWinSol: number;
  avgLossPct: number;
  avgLossSol: number;
  drawdownPct: number;
  drawdownSol: number;
  topWins: Array<{ token: string; pct: number; sol: number }>;
  topLosses: Array<{ token: string; pct: number; sol: number }>;
}

export interface FundCardData {
  id: string;
  name: string;
  handle: string;
  traderTwitter: string;
  description: string;
  type: FundType;
  tvl: number;
  perfFee: number;
  maxCap: number;
  investorCount: number;
  inviteOnly: boolean;
  performance: PerformancePoint[];
  stats: FundStats;
}
