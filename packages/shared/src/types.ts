export interface Fund {
  publicKey: string;
  manager: string;
  name: string;
  description: string;
  baseMint: string;
  vault: string;
  sharesMint: string;
  managementFee: number;
  performanceFee: number;
  totalShares: string;
  totalAssets: string;
  lastFeeCollection: string;
  createdAt: string;
  bump: number;
  vaultBump: number;
  sharesBump: number;
}

export interface InvestorPosition {
  publicKey: string;
  investor: string;
  fund: string;
  shares: string;
  initialInvestment: string;
  totalDeposited: string;
  totalWithdrawn: string;
  firstDepositAt: string;
  lastActivityAt: string;
}

export interface Trade {
  publicKey: string;
  fund: string;
  trader: string;
  tradeType: 'Buy' | 'Sell';
  inputMint: string;
  outputMint: string;
  amountIn: string;
  amountOut: string;
  timestamp: string;
  signature: string;
}

export interface FundPerformance {
  fundPublicKey: string;
  totalReturn: number;
  totalReturnPercentage: number;
  dailyReturn: number;
  weeklyReturn: number;
  monthlyReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
}

export interface CreateFundParams {
  name: string;
  description: string;
  managementFee: number;
  performanceFee: number;
  baseMint: string;
}

export interface DepositParams {
  fundPublicKey: string;
  amount: string;
}

export interface WithdrawParams {
  fundPublicKey: string;
  shares: string;
}

export interface TradeParams {
  fundPublicKey: string;
  inputMint: string;
  outputMint: string;
  amountIn: string;
  minimumAmountOut: string;
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}
