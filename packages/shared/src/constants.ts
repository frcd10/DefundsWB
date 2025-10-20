// Solana network constants
export const SOLANA_NETWORKS = {
  DEVNET: 'devnet',
  MAINNET: 'mainnet-beta',
  TESTNET: 'testnet',
} as const;

// Common token mints on Devnet
export const DEVNET_TOKENS = {
  USDC: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
} as const;

// Common token mints on Mainnet
export const MAINNET_TOKENS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
} as const;

// Fee constants (in basis points)
export const FEE_LIMITS = {
  MAX_MANAGEMENT_FEE: 500, // 5%
  MAX_PERFORMANCE_FEE: 2000, // 20%
} as const;

// Trading constants
export const TRADING = {
  DEFAULT_SLIPPAGE_BPS: 50, // 0.5%
  MAX_SLIPPAGE_BPS: 1000, // 10%
  MIN_TRADE_AMOUNT: 1000, // Minimum trade amount in base units
} as const;

// Time constants
export const TIME = {
  SECONDS_PER_DAY: 86400,
  SECONDS_PER_WEEK: 604800,
  SECONDS_PER_MONTH: 2629746, // Average month
  SECONDS_PER_YEAR: 31556952, // Average year
} as const;

// API endpoints
export const API_ENDPOINTS = {
  FUNDS: '/api/funds',
  TRADES: '/api/trades',
  ANALYTICS: '/api/analytics',
  QUOTES: '/api/quotes',
} as const;

// WebSocket events
export const WS_EVENTS = {
  FUND_CREATED: 'fund_created',
  FUND_UPDATED: 'fund_updated',
  DEPOSIT_MADE: 'deposit_made',
  WITHDRAWAL_MADE: 'withdrawal_made',
  TRADE_EXECUTED: 'trade_executed',
  PRICE_UPDATE: 'price_update',
} as const;
