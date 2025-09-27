import { WalletContextState } from '@solana/wallet-adapter-react';

// Placeholder implementation (still mock). Real logic should construct and send a withdrawal instruction.
export async function withdrawFromFund(_connection: any, wallet: WalletContextState, fundId: string, sharePercentage: number): Promise<string> {
  if (!wallet.publicKey) throw new Error('Wallet not connected');
  if (sharePercentage <= 0 || sharePercentage > 100) throw new Error('Invalid share percentage');
  console.log('Mock withdraw', sharePercentage, '% from fund', fundId);
  return 'mock_withdraw_' + Date.now();
}
