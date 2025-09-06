import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { JupiterService } from './jupiter.service';
import { toast } from 'sonner';
import type { ManagedFunds } from '../../../target/types/managed_funds';

export interface WithdrawalProgress {
  totalPositions: number;
  positionsLiquidated: number;
  estimatedTotal: number;
  status: 'initiating' | 'liquidating' | 'finalizing' | 'completed' | 'failed';
}

export class WithdrawalService {
  private jupiterService: JupiterService;
  private BATCH_SIZE = 3; // Number of positions to liquidate per transaction
  
  constructor(
    private program: Program<ManagedFunds>,
    private connection: Connection,
    private provider: AnchorProvider
  ) {
    this.jupiterService = new JupiterService(connection);
  }
  
  async initiateWithdrawal(
    vaultPubkey: PublicKey,
    sharesToWithdraw: number,
    onProgress?: (progress: WithdrawalProgress) => void
  ): Promise<string> {
    try {
      // Step 1: Create withdrawal state
      onProgress?.({
        totalPositions: 0,
        positionsLiquidated: 0,
        estimatedTotal: 0,
        status: 'initiating',
      });
      
      const [withdrawalStatePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('withdrawal'),
          vaultPubkey.toBuffer(),
          this.provider.wallet.publicKey.toBuffer(),
        ],
        this.program.programId
      );
      
      const [investorAccountPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('investor'),
          vaultPubkey.toBuffer(),
          this.provider.wallet.publicKey.toBuffer(),
        ],
        this.program.programId
      );
      
      // Build the initiate withdrawal instruction
      const initiateTx = await this.program.methods
        .initiateWithdrawal(new BN(sharesToWithdraw))
        .accounts({
          investor: this.provider.wallet.publicKey,
          vault: vaultPubkey,
          investorAccount: investorAccountPda,
          withdrawalState: withdrawalStatePda,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      
      // Send transaction with wallet confirmation
      const signature = await this.provider.sendAndConfirm(initiateTx, [], {
        skipPreflight: false,
        commitment: 'confirmed',
      });
      
      toast.success('Withdrawal initiated');
      console.log('Initiate withdrawal tx:', signature);
      
      // Step 2: Get vault positions
      const fund = await this.program.account.fund.fetch(vaultPubkey);
      const totalPositions = 0; // For now, since we don't have positions array in Fund struct
      
      // If no positions, just withdraw SOL directly
      if (totalPositions === 0) {
        return await this.withdrawDirectSOL(
          vaultPubkey,
          withdrawalStatePda,
          investorAccountPda,
          fund,
          sharesToWithdraw,
          onProgress
        );
      }
      
      // Step 3: Liquidate positions in batches
      let positionsLiquidated = 0;
      // No positions to liquidate for now - this would be implemented when position tracking is added
      /*
      const positionBatches = []; // No positions to liquidate for now
      
      for (const [batchIndex, batch] of positionBatches.entries()) {
        onProgress?.({
          totalPositions,
          positionsLiquidated,
          estimatedTotal: 0,
          status: 'liquidating',
        });
        
        // For now, simulate liquidation since Jupiter integration needs more setup
        // In production, this would execute actual swaps
        const liquidateTx = await this.program.methods
          .liquidatePositionsBatch(
            batch.map((_, i) => batchIndex * this.BATCH_SIZE + i),
            batch.map(() => new BN(1000000)) // Mock min amounts
          )
          .accounts({
            investor: this.provider.wallet.publicKey,
            withdrawalState: withdrawalStatePda,
            vault: vaultPubkey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();
        
        const liquidateSig = await this.provider.sendAndConfirm(liquidateTx, [], {
          skipPreflight: false,
          commitment: 'confirmed',
        });
        
        console.log(`Liquidation batch ${batchIndex + 1} tx:`, liquidateSig);
        positionsLiquidated += batch.length;
        toast.info(`Liquidated ${positionsLiquidated}/${totalPositions} positions`);
      }
      */
      
      // Step 4: Finalize withdrawal
      onProgress?.({
        totalPositions,
        positionsLiquidated: totalPositions,
        estimatedTotal: 0,
        status: 'finalizing',
      });
      
      const treasuryWallet = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_WALLET || '8NCLTHTiHJsgDoKyydY8vQfyi8RPDU4P59pCUHQGrBFm');
      
      // Get vault SOL account (PDA for holding SOL)
      const [vaultSolAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_sol'), vaultPubkey.toBuffer()],
        this.program.programId
      );
      
      const finalizeSig = await this.program.methods
        .finalizeWithdrawal()
        .rpc({
          skipPreflight: false,
          commitment: 'confirmed',
        });
      
      onProgress?.({
        totalPositions,
        positionsLiquidated: totalPositions,
        estimatedTotal: 0,
        status: 'completed',
      });
      
      toast.success('Withdrawal completed successfully!');
      console.log('Finalize withdrawal tx:', finalizeSig);
      return finalizeSig;
      
    } catch (error) {
      console.error('Withdrawal failed:', error);
      toast.error('Withdrawal failed. Please try again.');
      onProgress?.({
        totalPositions: 0,
        positionsLiquidated: 0,
        estimatedTotal: 0,
        status: 'failed',
      });
      throw error;
    }
  }
  
  private async withdrawDirectSOL(
    vaultPubkey: PublicKey,
    withdrawalStatePda: PublicKey,
    investorAccountPda: PublicKey,
    fund: any,
    sharesToWithdraw: number,
    onProgress?: (progress: WithdrawalProgress) => void
  ): Promise<string> {
    // For vaults with only SOL, directly finalize withdrawal
    onProgress?.({
      totalPositions: 0,
      positionsLiquidated: 0,
      estimatedTotal: 0,
      status: 'finalizing',
    });
    
    const treasuryWallet = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_WALLET || '8NCLTHTiHJsgDoKyydY8vQfyi8RPDU4P59pCUHQGrBFm');
    
    const [vaultSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol'), vaultPubkey.toBuffer()],
      this.program.programId
    );
    
    const signature = await this.program.methods
      .finalizeWithdrawal()
      .rpc({
        skipPreflight: false,
        commitment: 'confirmed',
      });
    
    onProgress?.({
      totalPositions: 0,
      positionsLiquidated: 0,
      estimatedTotal: 0,
      status: 'completed',
    });
    
    return signature;
  }
  
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
  
  private async getPositionDetails(vaultPubkey: PublicKey, mint: PublicKey) {
    // Fetch position details from program
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), vaultPubkey.toBuffer(), mint.toBuffer()],
      this.program.programId
    );
    
    // This would be implemented when VaultPosition account is used
    // For now, return mock data
    return {
      amount: new BN(0)
    };
    // return await this.program.account.vaultPosition.fetch(positionPda);
  }
  
  async calculateWithdrawalFees(
    vaultPubkey: PublicKey,
    sharesToWithdraw: number
  ): Promise<{
    estimatedReceived: number;
    performanceFee: number;
    platformFee: number;
    traderReceives: number;
    treasuryReceives: number;
  }> {
    const fund = await this.program.account.fund.fetch(vaultPubkey);
    const [investorAccountPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'), // Changed from 'investor' to 'position'
        this.provider.wallet.publicKey.toBuffer(),
        vaultPubkey.toBuffer(),
      ],
      this.program.programId
    );
    const investorAccount = await this.program.account.investorPosition.fetch(investorAccountPda);
    
    // Calculate share percentage
    const sharePercentage = (sharesToWithdraw / investorAccount.shares.toNumber()) * 100;
    const initialInvestment = (investorAccount.totalDeposited.toNumber() * sharePercentage) / 100;
    
    // For now, use vault's current SOL balance as the value
    // In production, this would calculate actual position values
    const [vaultSolAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol'), vaultPubkey.toBuffer()],
      this.program.programId
    );
    
    const vaultSolBalance = await this.connection.getBalance(vaultSolAccount);
    const withdrawalValue = (vaultSolBalance * sharePercentage) / 100 / LAMPORTS_PER_SOL;
    
    // Calculate profit
    const profit = Math.max(0, withdrawalValue - initialInvestment);
    
    // Calculate fees (using default values if not set in fund)
    const performanceFeeBps = fund.performanceFee || 2000; // 20%
    const platformFeeBps = 100; // 1% platform fee
    
    const performanceFee = profit > 0 ? (profit * performanceFeeBps) / 10000 : 0;
    const platformFeeFromPerformance = (performanceFee * 20) / 100; // 20% of performance fee
    const traderPerformanceFee = performanceFee - platformFeeFromPerformance;
    const platformWithdrawalFee = (withdrawalValue * platformFeeBps) / 10000;
    
    return {
      estimatedReceived: withdrawalValue - performanceFee - platformWithdrawalFee,
      performanceFee,
      platformFee: platformWithdrawalFee + platformFeeFromPerformance,
      traderReceives: traderPerformanceFee,
      treasuryReceives: platformWithdrawalFee + platformFeeFromPerformance,
    };
  }
  
  private async getVaultPositions(vaultPubkey: PublicKey) {
    const fund = await this.program.account.fund.fetch(vaultPubkey);
    const positions: Array<{ mint: string; amount: number }> = [];
    
    // For now, return empty array since we don't have positions tracking yet
    // This would be implemented when position tracking is added to the program
    /*
    for (const mint of fund.positions) {
      const position = await this.getPositionDetails(vaultPubkey, mint);
      positions.push({
        mint: mint.toString(),
        amount: position.amount.toNumber() / 1e9, // Convert to SOL
      });
    }
    */
    
    return positions;
  }
}
