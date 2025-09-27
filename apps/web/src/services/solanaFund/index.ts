import { Connection } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { createFund } from './fund/createFund';
import { depositToFund } from './deposit/depositToFund';
import { payFundInvestors } from './payout/payFundInvestors';
import { debugVault } from './debug/debugVault';
import { getFund } from './fund/getFund';
import { getUserFunds } from './fund/getUserFunds';
import { withdrawFromFund } from './withdraw/withdrawFromFund';
import { CreateFundParams } from './types';

export class SolanaFundServiceModular {
  private connection: Connection;
  constructor(rpcUrl?: string) {
    const url = rpcUrl || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(url, 'confirmed');
  }

  createFund(wallet: WalletContextState, params: CreateFundParams) {
    return createFund(this.connection, wallet, params);
  }
  depositToFund(wallet: WalletContextState, fundId: string, amount: number) {
    return depositToFund(this.connection, wallet, fundId, amount);
  }
  withdrawFromFund(wallet: WalletContextState, fundId: string, sharePercentage: number) {
    return withdrawFromFund(this.connection, wallet, fundId, sharePercentage);
  }
  payFundInvestors(wallet: WalletContextState, fundId: string, totalAmountSol: number, investorWallets: string[], treasuryWallet?: string) {
    return payFundInvestors(this.connection, wallet, fundId, totalAmountSol, investorWallets, treasuryWallet);
  }
  debugVault(wallet: WalletContextState, fundId: string) {
    return debugVault(this.connection, wallet, fundId);
  }
  getFund(fundId: string) {
    return getFund(this.connection, fundId);
  }
  getUserFunds(wallet: WalletContextState) {
    return getUserFunds(wallet);
  }
}

export const solanaFundServiceModular = new SolanaFundServiceModular();
export * from './types';
