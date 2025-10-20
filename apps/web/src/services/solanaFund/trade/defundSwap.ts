// Swap functionality removed. This module is intentionally stubbed.
import type { Connection } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';

export type DefundSwapParams = {
  fundName: string;
  inputMint: string;
  outputMint: string;
  amountIn: bigint | number;
  slippageBps?: number;
  jupiterProgramAllow?: string[];
  dexAllowlist?: string[];
};

export type DefundSwapResult = never;

export async function defundSwap(
  _connection: Connection,
  _wallet: WalletContextState,
  _params: DefundSwapParams,
): Promise<DefundSwapResult> {
  throw new Error('defundSwap is removed');
}
