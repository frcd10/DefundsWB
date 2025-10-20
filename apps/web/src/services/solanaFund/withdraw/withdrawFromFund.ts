import { WalletContextState } from '@solana/wallet-adapter-react';
import { BN, Program } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount, getMint, NATIVE_MINT, createCloseAccountInstruction } from '@solana/spl-token';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';
import { deriveInvestorPositionPda, deriveSharesMintPda, deriveVaultPda } from '../utils/pdas';

// Withdraw the investor's shares from the given fund and unwrap WSOL to SOL.
export async function withdrawFromFund(connection: Connection, wallet: WalletContextState, fundId: string, sharePercentage: number): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  if (sharePercentage <= 0 || sharePercentage > 100) throw new Error('Invalid share percentage');
  const fundPk = new PublicKey(fundId);
  const program = await getProgram(connection, wallet);

  // Fetch fund account to obtain base mint and validate seeds
  const fundAcc: any = await (program as any).account.fund.fetch(fundPk);
  const baseMint = new PublicKey(fundAcc.baseMint);
  const walletPk = wallet.publicKey;

  const [vaultPda] = deriveVaultPda(program.programId, fundPk);
  const [sharesMintPda] = deriveSharesMintPda(program.programId, fundPk);
  const [investorPositionPda] = deriveInvestorPositionPda(program.programId, walletPk, fundPk);

  // Ensure investor token accounts exist (WSOL ATA and Shares ATA)
  const investorWsolAta = await getAssociatedTokenAddress(baseMint, walletPk);
  const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, walletPk);
  const tx = new Transaction();
  // Create ATAs if missing
  const wsolAtaInfo = await connection.getAccountInfo(investorWsolAta);
  if (!wsolAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(walletPk, investorWsolAta, walletPk, baseMint));
  }
  const sharesAtaInfo = await connection.getAccountInfo(investorSharesAta);
  if (!sharesAtaInfo) {
    tx.add(createAssociatedTokenAccountInstruction(walletPk, investorSharesAta, walletPk, sharesMintPda));
  }

  // Determine shares to burn (percentage of current balance)
  const sharesAcc = await getAccount(connection, investorSharesAta).catch(() => null as any);
  if (!sharesAcc || !('amount' in sharesAcc)) throw new Error('No shares account or zero balance');
  const full = BigInt(String(sharesAcc.amount));
  if (full === BigInt(0)) throw new Error('No shares to withdraw');
  const toBurn = sharePercentage === 100 ? full : (full * BigInt(Math.floor(sharePercentage))) / BigInt(100);

  // Add withdraw ix
  const withdrawIx = await (program as any).methods
    .withdraw(new BN(toBurn.toString()))
    .accounts({
      fund: fundPk,
      vault: vaultPda,
      sharesMint: sharesMintPda,
      investorPosition: investorPositionPda,
      investorTokenAccount: investorWsolAta,
      investorSharesAccount: investorSharesAta,
      investor: walletPk,
      tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    })
    .instruction();
  tx.add(withdrawIx);

  // After withdraw, unwrap WSOL by closing the ATA
  tx.add(createCloseAccountInstruction(investorWsolAta, walletPk, walletPk));

  // Let wallet-adapter handle blockhash and feePayer
  const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: false, preflightCommitment: 'processed' } as any);
  try { await connection.confirmTransaction(sig, 'confirmed'); } catch {}
  return sig;
}

export async function withdrawAllFromFund(connection: Connection, wallet: WalletContextState, fundId: string) {
  return withdrawFromFund(connection, wallet, fundId, 100);
}
