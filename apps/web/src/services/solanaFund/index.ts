import { Connection } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { createFund } from './fund/createFund';
import { depositToFund } from './deposit/depositToFund';
import { payFundInvestors } from './payout/payFundInvestors';
import { getFund } from './fund/getFund';
import { getUserFunds } from './fund/getUserFunds';
import { withdrawFromFund } from './withdraw/withdrawFromFund';
import { CreateFundParams } from './types';
import { repairVaultTokenAccount } from './fund/repairVault';
// Swap removed: do not import defundSwap

export class SolanaFundServiceModular {
  private connection: Connection;
  constructor(rpcUrl?: string) {
    const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta';
    const isBrowser = typeof window !== 'undefined';
    // In the browser, use the client-exposed URL or the proxy for mainnet.
    // On the server (SSR/prerender), use absolute server-side URLs (Helius or public) — never a relative path.
    const url = (() => {
      if (isBrowser) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return (
          rpcUrl ||
          process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
          (cluster === 'mainnet-beta' ? `${origin}/api/rpc` : 'https://api.devnet.solana.com')
        );
      }
      return (
        rpcUrl ||
        process.env.SOLANA_RPC_URL ||
        process.env.ANCHOR_PROVIDER_URL ||
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        (cluster === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com')
      );
    })();
    const wsEndpoint = (() => {
      const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (backend) return `${backend.replace(/\/$/, '')}/ws/rpc`;
      return process.env.NEXT_PUBLIC_SOLANA_WS_URL || undefined;
    })();
    this.connection = new Connection(url, { commitment: 'confirmed', wsEndpoint });
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
  repairVault(wallet: WalletContextState, fundId: string) {
    return repairVaultTokenAccount(this.connection, wallet, fundId);
  }
  getFund(fundId: string) {
    return getFund(this.connection, fundId);
  }
  getUserFunds(wallet: WalletContextState) {
    return getUserFunds(wallet);
  }

  // Swap removed
  
  // Recovery helpers removed per request
}

export const solanaFundServiceModular = new SolanaFundServiceModular();
export * from './types';
// Swap removed: no re-export
