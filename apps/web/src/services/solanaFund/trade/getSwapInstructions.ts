import { PublicKey } from '@solana/web3.js';
import type { QuoteResponse } from './getJupiterQuote';

export type SwapInstructionsParams = {
  // Authority that ultimately sends the transaction (we'll pass the fund PDA as owner of source/destination)
  userPublicKey: string; // manager pubkey or fund authority as required by lite-api
  sourceTokenAccount: string; // fund-owned source ATA
  destinationTokenAccount: string; // fund-owned destination ATA
  quote: QuoteResponse; // from getJupiterQuote
};

export type SwapInstructionsResponse = {
  // The serialized Router instruction data for our on-chain handler argument (jupiter_ix_data)
  routerInstructionData: Uint8Array;
  // Ordered accounts expected by Router, to be plumbed as remaining_accounts
  accounts: { pubkey: string; isWritable: boolean }[];
};

function getBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_JUPITER_QUOTE_API || process.env.JUPITER_QUOTE_API;
  return (env && env.replace(/\/$/, '')) || 'https://lite-api.jup.ag';
}

export async function getSwapInstructions(params: SwapInstructionsParams): Promise<SwapInstructionsResponse> {
  // Basic key validations
  // eslint-disable-next-line no-new
  new PublicKey(params.userPublicKey);
  // eslint-disable-next-line no-new
  new PublicKey(params.sourceTokenAccount);
  // eslint-disable-next-line no-new
  new PublicKey(params.destinationTokenAccount);

  const base = getBaseUrl();

  // Construct body per lite-api expectations for /swap-instructions
  // The exact body fields may evolve, but generally include the quote/routePlan and user/source/destination.
  const body = {
    userPublicKey: params.userPublicKey,
    sourceTokenAccount: params.sourceTokenAccount,
    destinationTokenAccount: params.destinationTokenAccount,
    // Use the full raw quote so backend can build exact router ix
    quoteResponse: params.quote.raw,
  } as Record<string, unknown>;

  const res = await fetch(`${base}/swap/v1/swap-instructions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`swap-instructions failed: ${res.status} ${text}`);
  }
  const json = await res.json();

  // Normalize fields that we need for CPI
  if (!json || !json.swapInstruction || !json.swapInstruction.accounts || !json.swapInstruction.data) {
    throw new Error('swap-instructions response missing required fields');
  }

  const accounts = json.swapInstruction.accounts.map((a: any) => ({
    pubkey: String(a.pubkey ?? a.pubKey ?? a.address),
    isWritable: Boolean(a.isWritable ?? a.is_writable),
  }));

  // Data may be base64 or hex encoded depending on backend; detect and decode
  const dataField: string = json.swapInstruction.data;
  let bytes: Uint8Array;
  if (/^[0-9a-fA-F]+$/.test(dataField) && dataField.length % 2 === 0) {
    // hex
    const arr = new Uint8Array(dataField.length / 2);
    for (let i = 0; i < dataField.length; i += 2) arr[i / 2] = parseInt(dataField.slice(i, i + 2), 16);
    bytes = arr;
  } else {
    // assume base64
    const b64 = typeof atob === 'function' ? atob(dataField) : Buffer.from(dataField, 'base64').toString('binary');
    const arr = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
    bytes = arr;
  }

  return { routerInstructionData: bytes, accounts };
}
