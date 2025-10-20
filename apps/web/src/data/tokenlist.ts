export type TokenInfo = {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoURI?: string;
};

export type TokenList = TokenInfo[];

const SOL: TokenInfo = {
  symbol: 'SOL',
  name: 'Solana',
  mint: 'So11111111111111111111111111111111111111112',
  decimals: 9,
  logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png'
};

// Minimal mainnet commonly used tokens
const MAINNET_TOKENS: TokenList = [
  SOL,
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
  },
];

// Minimal devnet equivalents
const DEVNET_TOKENS: TokenList = [
  SOL,
  {
    symbol: 'USDC',
    name: 'USD Coin (Devnet)',
    mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  },
];

export function getCluster() {
  return (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta') as 'mainnet-beta' | 'devnet' | string;
}

export function getTokenList(): TokenList {
  const c = getCluster();
  return c === 'devnet' ? DEVNET_TOKENS : MAINNET_TOKENS;
}

export function findTokenByMint(mint: string): TokenInfo | undefined {
  return getTokenList().find(t => t.mint === mint);
}

export function toBaseUnits(amountUi: number, decimals: number): bigint {
  return BigInt(Math.floor(amountUi * Math.pow(10, decimals)));
}

export function fromBaseUnits(raw: string | number | bigint, decimals: number): number {
  const n = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'string' ? Number(raw) : raw;
  return n / Math.pow(10, decimals);
}
