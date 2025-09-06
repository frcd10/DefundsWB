import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import axios from 'axios';

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  marketInfos: any[];
}

export interface TokenPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

export class JupiterService {
  private readonly apiUrl = 'https://quote-api.jup.ag/v6';
  private readonly priceApiUrl = 'https://price.jup.ag/v4';
  
  constructor(private connection: Connection) {}
  
  async getQuote(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote> {
    try {
      const response = await axios.get(`${this.apiUrl}/quote`, {
        params: {
          inputMint: inputMint.toString(),
          outputMint: outputMint.toString(),
          amount: amount.toString(),
          slippageBps,
        },
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting Jupiter quote:', error);
      throw error;
    }
  }
  
  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: PublicKey,
    wrapUnwrapSOL: boolean = true
  ): Promise<VersionedTransaction> {
    try {
      const response = await axios.post(`${this.apiUrl}/swap`, {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: wrapUnwrapSOL,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      });
      
      const swapTransactionBuf = Buffer.from(response.data.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      return transaction;
    } catch (error) {
      console.error('Error getting swap transaction:', error);
      throw error;
    }
  }
  
  async getTokenPrices(mints: string[]): Promise<Map<string, number>> {
    try {
      const ids = mints.join(',');
      const response = await axios.get(`${this.priceApiUrl}/price`, {
        params: { ids },
      });
      
      const priceMap = new Map<string, number>();
      Object.entries(response.data.data).forEach(([mint, data]: [string, any]) => {
        priceMap.set(mint, data.price);
      });
      
      return priceMap;
    } catch (error) {
      console.error('Error fetching token prices:', error);
      throw error;
    }
  }
  
  async getPortfolioValue(positions: Array<{ mint: string; amount: number }>): Promise<number> {
    if (positions.length === 0) return 0;
    
    const mints = positions.map(p => p.mint);
    const prices = await this.getTokenPrices(mints);
    
    let totalValue = 0;
    positions.forEach(position => {
      const price = prices.get(position.mint) || 0;
      totalValue += position.amount * price;
    });
    
    return totalValue;
  }
  
  async liquidatePositionBatch(
    positions: Array<{ mint: PublicKey; amount: number }>,
    userPublicKey: PublicKey,
    slippageBps: number = 100
  ): Promise<VersionedTransaction[]> {
    const transactions: VersionedTransaction[] = [];
    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    for (const position of positions) {
      const quote = await this.getQuote(
        position.mint,
        solMint,
        position.amount,
        slippageBps
      );
      
      const transaction = await this.getSwapTransaction(quote, userPublicKey);
      transactions.push(transaction);
    }
    
    return transactions;
  }
}
