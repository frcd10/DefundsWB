import { WalletContextState } from '@solana/wallet-adapter-react';
import { SolanaFund } from '../types';

export async function getUserFunds(wallet: WalletContextState): Promise<SolanaFund[]> {
  if (!wallet.publicKey) return [];
  return [];
}
