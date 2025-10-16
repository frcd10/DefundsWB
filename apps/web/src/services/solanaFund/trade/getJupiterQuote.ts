import { PublicKey } from '@solana/web3.js';

export type QuoteParams = {
  inputMint: string; // mint address
  outputMint: string; // mint address
  amount: string | number | bigint; // raw amount in smallest units
  slippageBps?: number; // default 2000 (20%)
  onlyDirectRoutes?: boolean; // optional
  preferDexes?: string[]; // optional, names per Jupiter
};

export type QuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string; // min out after slippage
  slippageBps: number;
  priceImpactPct: number;
  routePlan: unknown; // opaque, used by /swap-instructions
  raw: any; // full response for swap-instructions
};

const DEFAULT_SLIPPAGE_BPS = 2000; // 20%

function getBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_JUPITER_QUOTE_API || process.env.JUPITER_QUOTE_API;
  return (env && env.replace(/\/$/, '')) || 'https://lite-api.jup.ag';
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) search.set(k, String(v));
  }
  return search.toString();
}

export async function getJupiterQuote(params: QuoteParams): Promise<QuoteResponse> {
  // Basic client-side validation
  try {
    // Validate that input/output are valid pubkeys (mints)
    // eslint-disable-next-line no-new
    new PublicKey(params.inputMint);
    // eslint-disable-next-line no-new
    new PublicKey(params.outputMint);
  } catch (e) {
    throw new Error('Invalid mint address provided');
  }

  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const base = getBaseUrl();
  const query = toQuery({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps,
    onlyDirectRoutes: params.onlyDirectRoutes,
    preferDexes: params.preferDexes?.join(',')
  });

  const url = `${base}/swap/v1/quote?${query}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Quote request failed: ${res.status} ${text}`);
  }
  const json = await res.json();

  // The lite API returns either a route or an error; normalize a few fields we need.
  if (!json || !json.outAmount || !json.otherAmountThreshold) {
    throw new Error('Quote response missing required fields');
  }

  return {
    inputMint: json.inputMint,
    inAmount: json.inAmount,
    outputMint: json.outputMint,
    outAmount: json.outAmount,
    otherAmountThreshold: json.otherAmountThreshold,
    slippageBps: json.slippageBps,
    priceImpactPct: json.priceImpactPct ?? 0,
    routePlan: json.routePlan,
    raw: json,
  } as QuoteResponse;
}
