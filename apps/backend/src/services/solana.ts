import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

interface JupiterQuoteV6 {
  inAmount?: string;
  outAmount?: string;
  priceImpactPct?: number | string;
  routePlan?: unknown[];
}

class SolanaService {
  private connection!: Connection;
  private provider!: AnchorProvider;

  async initialize() {
    const rpcUrl =
      process.env.BACKEND_SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      'https://api.mainnet-beta.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    // For server-side operations, we use a dummy wallet
    // Real operations will use user's wallet from frontend
    const dummyWallet = new Wallet(Keypair.generate());
    this.provider = new AnchorProvider(this.connection, dummyWallet, {
      commitment: 'confirmed',
    });

    console.log(`Solana service initialized (rpc=${rpcUrl})`);
  }

  async verifyTransaction(signature: string): Promise<boolean> {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      return transaction !== null;
    } catch (error) {
      console.error('Error verifying transaction:', error);
      return false;
    }
  }

  async getFunds() {
    try {
      // For now, return mock data until program is deployed
      return [
        {
          publicKey: 'mock-fund-1',
          manager: 'mock-manager-1',
          name: 'Sample Fund 1',
          description: 'A sample managed fund',
          totalAssets: '1000000',
          totalShares: '1000000',
          managementFee: 100,
          performanceFee: 1000,
        },
      ];
    } catch (error) {
      console.error('Error fetching funds:', error);
      throw error;
    }
  }

  async getFund(fundPublicKey: string) {
    try {
      // Mock implementation
      return {
        publicKey: fundPublicKey,
        manager: 'mock-manager',
        name: 'Sample Fund',
        description: 'A sample managed fund',
        totalAssets: '1000000',
        totalShares: '1000000',
        managementFee: 100,
        performanceFee: 1000,
      };
    } catch (error) {
      console.error('Error fetching fund:', error);
      throw error;
    }
  }

  async getInvestorPosition(investor: string, fund: string) {
    try {
      // Mock implementation
      return {
        publicKey: 'mock-position',
        investor,
        fund,
        shares: '10000',
        initialInvestment: '10000',
        totalDeposited: '10000',
        totalWithdrawn: '0',
      };
    } catch (error) {
      console.error('Error fetching investor position:', error);
      return null;
    }
  }

  async getTrades(fundPublicKey?: string, limit: number = 100) {
    try {
      // Mock implementation
      return [
        {
          publicKey: 'mock-trade-1',
          fund: fundPublicKey || 'mock-fund',
          trader: 'mock-trader',
          tradeType: 'Buy',
          inputMint: 'mock-input-mint',
          outputMint: 'mock-output-mint',
          amountIn: '1000',
          amountOut: '950',
          timestamp: Date.now().toString(),
          signature: 'mock-signature',
        },
      ];
    } catch (error) {
      console.error('Error fetching trades:', error);
      throw error;
    }
  }

  async getQuote(inputMint: string, outputMint: string, amount: number) {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: '50',
      });
      const url = `https://quote-api.jup.ag/v6/quote?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Jupiter quote failed: ${res.status} ${txt}`);
      }
  const quote = (await res.json()) as JupiterQuoteV6;
      return {
        inputMint,
        outputMint,
        inAmount: quote.inAmount ?? amount.toString(),
        outAmount: quote.outAmount ?? '0',
        priceImpactPct: String(quote.priceImpactPct ?? ''),
        routePlan: quote.routePlan ?? [],
      };
    } catch (error) {
      console.error('Error getting quote (Jupiter):', error);
      throw error;
    }
  }

  getConnection() {
    return this.connection;
  }
}

export const solanaService = new SolanaService();
