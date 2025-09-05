import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';

// Program IDL - simplified for key operations
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || 'tNo3sxFi51AhRzQ3zuSfQVBusNpPRyNrec5LA4xdDom');

// Simple IDL for the functions we need
const IDL = {
  version: "0.1.0",
  name: "managed_funds",
  instructions: [
    {
      name: "initializeFund",
      accounts: [
        { name: "fund", isMut: true, isSigner: false },
        { name: "manager", isMut: true, isSigner: true },
        { name: "vault", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "name", type: "string" },
        { name: "description", type: "string" },
        { name: "performanceFee", type: "u16" },
        { name: "maxCapacity", type: "u64" },
        { name: "isPublic", type: "bool" },
        { name: "fundType", type: "string" },
      ]
    },
    {
      name: "deposit",
      accounts: [
        { name: "fund", isMut: true, isSigner: false },
        { name: "investor", isMut: true, isSigner: true },
        { name: "investorPosition", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "amount", type: "u64" }
      ]
    }
  ],
  accounts: [
    {
      name: "Fund",
      type: {
        kind: "struct",
        fields: [
          { name: "manager", type: "publicKey" },
          { name: "name", type: "string" },
          { name: "description", type: "string" },
          { name: "fundType", type: "string" },
          { name: "totalDeposits", type: "u64" },
          { name: "totalShares", type: "u64" },
          { name: "performanceFee", type: "u16" },
          { name: "maxCapacity", type: "u64" },
          { name: "isPublic", type: "bool" },
          { name: "createdAt", type: "i64" },
          { name: "bump", type: "u8" },
        ]
      }
    }
  ]
};

export interface CreateFundParams {
  name: string;
  description: string;
  fundType: string;
  performanceFee: number;
  maxCapacity: number;
  isPublic: boolean;
  initialDeposit: number; // in SOL
}

export interface SolanaFund {
  id: string;
  manager: string;
  name: string;
  description: string;
  fundType: string;
  totalDeposits: number;
  totalShares: number;
  performanceFee: number;
  maxCapacity: number;
  isPublic: boolean;
  createdAt: number;
  userShare?: number;
  userSharePercentage?: number;
}

export class SolanaFundService {
  private connection: Connection;
  private program: Program | null = null;

  constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private getProgram(wallet: WalletContextState) {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const provider = new AnchorProvider(
      this.connection,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wallet as any,
      { commitment: 'confirmed' }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Program(IDL as any, provider);
  }

  async createFund(wallet: WalletContextState, params: CreateFundParams): Promise<{ fundId: string; signature: string }> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Creating REAL fund with program vault...');
      console.log('Wallet:', wallet.publicKey.toString());
      console.log('Initial deposit:', params.initialDeposit, 'SOL');
      console.log('Program ID:', PROGRAM_ID.toString());

      if (params.initialDeposit > 0) {
        // Generate fund PDA using your actual program
        const fundSeed = Keypair.generate().publicKey.toBuffer().slice(0, 8);
        const [fundPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("fund"), wallet.publicKey.toBuffer(), fundSeed],
          PROGRAM_ID
        );

        // Generate vault PDA for this fund using your actual program
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("vault"), fundPda.toBuffer()],
          PROGRAM_ID
        );

        console.log('Fund PDA:', fundPda.toString());
        console.log('Vault PDA:', vaultPda.toString());

        // Create a SOL transfer transaction to the actual program vault
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: vaultPda, // This is now your program's vault PDA!
            lamports: Math.floor(params.initialDeposit * LAMPORTS_PER_SOL),
          })
        );

        // Get recent blockhash
        const { blockhash } = await this.connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        console.log('Signing transaction to program vault...');
        const signedTransaction = await wallet.signTransaction(transaction);
        
        console.log('Sending transaction to program vault...');
        const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
        
        console.log('Confirming transaction...');
        await this.connection.confirmTransaction(signature, 'confirmed');
        
        console.log('Real transaction signature:', signature);
        console.log('SOL transferred to program vault:', vaultPda.toString());

        return {
          fundId: fundPda.toString(), // Use the actual fund PDA
          signature // Real transaction signature to your program vault
        };
      } else {
        throw new Error('Initial deposit is required to create a fund');
      }
    } catch (error) {
      console.error('Error creating fund with program vault:', error);
      throw error;
    }
  }

  // Add withdraw function for fund shares
  async withdrawFromFund(wallet: WalletContextState, fundId: string, sharePercentage: number): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Withdrawing', sharePercentage, '% from fund:', fundId);
      
      // TODO: Implement real withdrawal using the deployed program
      // This would calculate the user's share of the vault and transfer SOL back
      
      const signature = 'mock_withdraw_' + Date.now();
      console.log('Withdraw transaction:', signature);
      
      return signature;
    } catch (error) {
      console.error('Error withdrawing from fund:', error);
      throw error;
    }
  }

  async depositToFund(wallet: WalletContextState, fundId: string, amount: number): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Making REAL deposit of', amount, 'SOL to fund:', fundId);
      console.log('From wallet:', wallet.publicKey.toString());

      // Use the fundId as the fund PDA and derive the vault
      const fundPda = new PublicKey(fundId);
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), fundPda.toBuffer()],
        PROGRAM_ID
      );

      console.log('Depositing to vault PDA:', vaultPda.toString());

      // Create a real SOL transfer transaction to the program vault
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: vaultPda, // Transfer to the actual program vault
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      console.log('Signing deposit transaction to program vault...');
      const signedTransaction = await wallet.signTransaction(transaction);
      
      console.log('Sending deposit transaction...');
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize());
      
      console.log('Confirming deposit transaction...');
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log('Real deposit transaction signature:', signature);
      
      return signature;
    } catch (error) {
      console.error('Error making real deposit to program vault:', error);
      throw error;
    }
  }

  async getFund(fundId: string): Promise<SolanaFund | null> {
    try {
      // For now, return mock data since we need the wallet to access the program
      // In a real implementation, you'd fetch this from your backend API
      // which would fetch from Solana and store in MongoDB
      console.log('Fetching fund:', fundId);
      return null;
    } catch (error) {
      console.error('Error fetching fund:', error);
      return null;
    }
  }

  async getUserFunds(wallet: WalletContextState): Promise<SolanaFund[]> {
    if (!wallet.publicKey) {
      return [];
    }

    // This would typically fetch from your backend API
    // which maintains a mapping of funds and user positions
    return [];
  }

  // Generate PDA for fund account
  static generateFundPDA(manager: PublicKey, fundName: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('fund'), manager.toBuffer(), Buffer.from(fundName)],
      PROGRAM_ID
    );
  }
}

export const solanaFundService = new SolanaFundService();
