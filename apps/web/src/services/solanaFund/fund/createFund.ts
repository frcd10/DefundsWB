import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import bs58 from 'bs58';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';
import { CreateFundParams } from '../types';
import { deriveFundPda, deriveSharesMintPda, deriveVaultPda, deriveInvestorPositionPda } from '../utils/pdas';
import { normalizeAmount, assertValidAmount } from '../utils/amount';

// Simple inflight guard to avoid duplicate submits (React double render / double click)
const inflight = new Set<string>();

// Handles initialization (with optional initial deposit) reusing logic from monolith service
export async function createFund(connection: any, wallet: WalletContextState, params: CreateFundParams) {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const walletPk = wallet.publicKey; // non-null after guard

  const program = await getProgram(connection, wallet);
  const name = params.name.slice(0, 32);
  const description = params.description.slice(0, 100);
  const managementFeeBps = 200;
  const performanceFeeBps = Math.max(0, Math.floor(params.performanceFee * 100));

  const [fundPda] = deriveFundPda(program.programId, walletPk, name);
  const [vaultPda] = deriveVaultPda(program.programId, fundPda);
  const [sharesMintPda] = deriveSharesMintPda(program.programId, fundPda);

  const [fundInfo] = await Promise.all([
    connection.getAccountInfo(fundPda)
  ]);

  const opKey = `create:${fundPda.toBase58()}`;
  if (inflight.has(opKey)) throw new Error('Create already in progress');
  inflight.add(opKey);
  try {
    if (fundInfo && !(params.initialDeposit && params.initialDeposit > 0)) {
      throw new Error('A fund with this name already exists for your wallet. Choose a different name or make a deposit.');
    }
    const rawInitial = (params as any).initialDeposit;
    const normalizedInitial = normalizeAmount(rawInitial);
    if (fundInfo && normalizedInitial > 0) {
      return depositOnlyAfterExistingFund(connection, wallet, program, fundPda, vaultPda, sharesMintPda, normalizedInitial);
    }
    if (normalizedInitial > 0) {
      return initializeAndDeposit(connection, wallet, program, fundPda, vaultPda, sharesMintPda, { name, description, managementFeeBps, performanceFeeBps }, normalizedInitial);
    }
    return initializeOnly(connection, wallet, program, fundPda, vaultPda, sharesMintPda, { name, description, managementFeeBps, performanceFeeBps });
  } finally {
    inflight.delete(opKey);
  }
}

async function initializeOnly(connection: any, wallet: WalletContextState, program: any, fundPda: PublicKey, vaultPda: PublicKey, sharesMintPda: PublicKey, meta: { name: string; description: string; managementFeeBps: number; performanceFeeBps: number; }) {
  const walletPk = wallet.publicKey!;
  const initIx = await program.methods
    .initializeFund(meta.name, meta.description, meta.managementFeeBps, meta.performanceFeeBps)
    .accounts({
      fund: fundPda,
      vault: vaultPda,
      sharesMint: sharesMintPda,
      baseMint: NATIVE_MINT,
  manager: walletPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const tx = new Transaction().add(initIx);
  const sig = await sendAndConfirmWithRetry(connection, wallet, tx);
  return { fundId: fundPda.toString(), signature: sig };
}

async function initializeAndDeposit(connection: any, wallet: WalletContextState, program: any, fundPda: PublicKey, vaultPda: PublicKey, sharesMintPda: PublicKey, meta: { name: string; description: string; managementFeeBps: number; performanceFeeBps: number; }, initialDeposit: number) {
  const walletPk = wallet.publicKey!;
  assertValidAmount(initialDeposit, 'initial deposit');
  const initIx = await program.methods
    .initializeFund(meta.name, meta.description, meta.managementFeeBps, meta.performanceFeeBps)
    .accounts({
      fund: fundPda,
      vault: vaultPda,
      sharesMint: sharesMintPda,
      baseMint: NATIVE_MINT,
      manager: wallet.publicKey,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const amountLamports = Math.floor(initialDeposit * LAMPORTS_PER_SOL);
  const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, walletPk);
  const tx = new Transaction();
  const ataInfo = await connection.getAccountInfo(investorWsolAta);
  if (!ataInfo) {
  tx.add(createAssociatedTokenAccountInstruction(walletPk, investorWsolAta, walletPk, NATIVE_MINT));
  }
  tx.add(SystemProgram.transfer({ fromPubkey: walletPk, toPubkey: investorWsolAta, lamports: amountLamports }));
  tx.add(createSyncNativeInstruction(investorWsolAta));

  const [investorPositionPda] = deriveInvestorPositionPda(program.programId, walletPk, fundPda);
  const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, walletPk);
  const depositIx = await (program as any).methods
    .deposit(new BN(amountLamports))
    .accounts({
      fund: fundPda,
      vault: vaultPda,
      sharesMint: sharesMintPda,
      investorPosition: investorPositionPda,
      investorTokenAccount: investorWsolAta,
      investorSharesAccount: investorSharesAta,
  investor: walletPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  tx.add(initIx);
  tx.add(depositIx);
  const sig = await sendAndConfirmWithRetry(connection, wallet, tx);
  return { fundId: fundPda.toString(), signature: sig };
}

async function depositOnlyAfterExistingFund(connection: any, wallet: WalletContextState, program: any, fundPda: PublicKey, vaultPda: PublicKey, sharesMintPda: PublicKey, initialDeposit: number) {
  const walletPk = wallet.publicKey!;
  assertValidAmount(initialDeposit, 'deposit');
  const amountLamports = Math.floor(initialDeposit * LAMPORTS_PER_SOL);
  const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, walletPk);
  const tx = new Transaction();
  const ataInfo = await connection.getAccountInfo(investorWsolAta);
  if (!ataInfo) {
  tx.add(createAssociatedTokenAccountInstruction(walletPk, investorWsolAta, walletPk, NATIVE_MINT));
  }
  tx.add(SystemProgram.transfer({ fromPubkey: walletPk, toPubkey: investorWsolAta, lamports: amountLamports }));
  tx.add(createSyncNativeInstruction(investorWsolAta));
  const [investorPositionPda] = deriveInvestorPositionPda(program.programId, walletPk, fundPda);
  const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, walletPk);
  const depositIx = await (program as any).methods
    .deposit(new BN(amountLamports))
    .accounts({
      fund: fundPda,
      vault: vaultPda,
      sharesMint: sharesMintPda,
      investorPosition: investorPositionPda,
      investorTokenAccount: investorWsolAta,
      investorSharesAccount: investorSharesAta,
  investor: walletPk,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
  tx.add(depositIx);
  const sig = await sendAndConfirmWithRetry(connection, wallet, tx);
  return { fundId: fundPda.toString(), signature: sig };
}
