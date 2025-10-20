// Jupiter Integration Service - Mainnet Only
// This module handles real token swaps using Jupiter's API on mainnet
// Jupiter only supports mainnet, not devnet

const { Connection, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch').default || require('node-fetch');

class JupiterService {
  constructor(connection) {
    this.connection = connection;
    // Use lite-api for free usage (no API key required)
    this.baseUrl = 'https://lite-api.jup.ag';
    
    console.log(`✅ Jupiter service initialized for mainnet trading`);
  }

  /**
   * Get a quote for swapping tokens
   * @param {string} inputMint - Input token mint address
   * @param {string} outputMint - Output token mint address  
   * @param {number} amount - Amount to swap (in lamports/smallest unit)
   * @param {number} slippageBps - Slippage in basis points (e.g., 50 = 0.5%)
   * @returns {Promise<Object>} Quote response
   */
  async getQuote(inputMint, outputMint, amount, slippageBps = 50) {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
        restrictIntermediateTokens: 'true', // Better stability
        maxAccounts: '64' // Reasonable limit
      });

      const url = `${this.baseUrl}/swap/v1/quote?${params}`;
      console.log(`🔍 Getting Jupiter quote: ${url}`);

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Quote API failed: ${response.status} - ${errorText}`);
      }

      const quote = await response.json();
      
      console.log(`✅ Quote received:`);
      console.log(`   Input: ${quote.inAmount} ${inputMint.slice(0, 8)}...`);
      console.log(`   Output: ${quote.outAmount} ${outputMint.slice(0, 8)}...`);
      console.log(`   Price Impact: ${quote.priceImpactPct}%`);
      console.log(`   Route: ${quote.routePlan.length} step(s)`);

      return quote;
    } catch (error) {
      console.error('❌ Error getting Jupiter quote:', error.message);
      throw error;
    }
  }

  /**
   * Build a swap transaction from a quote
   * @param {Object} quote - Quote from getQuote()
   * @param {string} userPublicKey - User's wallet public key
   * @param {boolean} dynamicSlippage - Use dynamic slippage optimization
   * @returns {Promise<Object>} Swap transaction response
   */
  async buildSwapTransaction(quote, userPublicKey, dynamicSlippage = true) {
    try {
      const swapBody = {
        quoteResponse: quote,
        userPublicKey,
        dynamicComputeUnitLimit: true, // Optimize compute units
        dynamicSlippage, // Optimize slippage
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000, // Max 0.001 SOL priority fee
            priorityLevel: "high" // Use high priority for better landing rate
          }
        }
      };

      console.log(`🔨 Building Jupiter swap transaction...`);

      const response = await fetch(`${this.baseUrl}/swap/v1/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(swapBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Swap API failed: ${response.status} - ${errorText}`);
      }

      const swapResponse = await response.json();
      
      console.log(`✅ Swap transaction built:`);
      console.log(`   Compute Units: ${swapResponse.computeUnitLimit}`);
      console.log(`   Priority Fee: ${swapResponse.prioritizationFeeLamports} lamports`);
      if (swapResponse.dynamicSlippageReport) {
        console.log(`   Dynamic Slippage: ${swapResponse.dynamicSlippageReport.slippageBps} bps`);
      }

      return swapResponse;
    } catch (error) {
      console.error('❌ Error building Jupiter swap transaction:', error.message);
      throw error;
    }
  }

  /**
   * Execute a complete swap (quote + build + send)
   * @param {string} inputMint - Input token mint address
   * @param {string} outputMint - Output token mint address
   * @param {number} amount - Amount to swap (in lamports/smallest unit)
   * @param {Object} wallet - Wallet with publicKey and signTransaction methods
   * @param {number} slippageBps - Slippage in basis points
   * @returns {Promise<string>} Transaction signature
   */
  async executeSwap(inputMint, outputMint, amount, wallet, slippageBps = 50) {
    try {
      console.log(`\n🔄 EXECUTING JUPITER SWAP:`);
      console.log(`   From: ${inputMint} (${amount} units)`);
      console.log(`   To: ${outputMint}`);
      console.log(`   Slippage: ${slippageBps} bps (${slippageBps/100}%)`);

      // Step 1: Get quote
      const quote = await this.getQuote(inputMint, outputMint, amount, slippageBps);

      // Step 2: Build transaction
      const swapTransaction = await this.buildSwapTransaction(quote, wallet.publicKey.toString());

      // Step 3: Deserialize and sign transaction
      const swapTransactionBuf = Buffer.from(swapTransaction.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign the transaction
      console.log(`✍️  Signing transaction...`);
      transaction.sign([wallet.payer]); // wallet.payer should be the Keypair

      // Step 4: Send transaction
      console.log(`📡 Sending transaction to network...`);
      const signature = await this.connection.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Step 5: Confirm transaction
      console.log(`⏳ Confirming transaction: ${signature}`);
      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`✅ Jupiter swap completed successfully!`);
      console.log(`   Transaction: ${signature}`);
  console.log(`   Explorer: https://explorer.solana.com/tx/${signature}`);

      return signature;
    } catch (error) {
      console.error('❌ Error executing Jupiter swap:', error.message);
      throw error;
    }
  }

  /**
   * Helper method to format token amounts for display
   * @param {string|number} amount - Token amount in smallest units
   * @param {number} decimals - Token decimals
   * @returns {string} Formatted amount
   */
  formatTokenAmount(amount, decimals = 9) {
    const num = typeof amount === 'string' ? parseInt(amount) : amount;
    return (num / Math.pow(10, decimals)).toFixed(decimals);
  }
}

module.exports = { JupiterService };
