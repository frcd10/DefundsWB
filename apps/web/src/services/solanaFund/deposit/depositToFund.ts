import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';
import { normalizeAmount, assertValidAmount } from '../utils/amount';
import { deriveSharesMintPda, deriveVaultPda, deriveInvestorPositionPda } from '../utils/pdas';

const inflight = new Set<string>();

export async function depositToFund(connection: any, wallet: WalletContextState, fundId: string, amount: number | string): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const walletPk = wallet.publicKey;
  const normalized = normalizeAmount(amount as any);
  assertValidAmount(normalized, 'deposit');
  const opKey = `deposit:${fundId}`;
  if (inflight.has(opKey)) throw new Error('A deposit is already in progress for this fund. Please wait.');
  inflight.add(opKey);

  try {
    const program = await getProgram(connection, wallet);
    const fundPda = new PublicKey(fundId);
    const [vaultPda] = deriveVaultPda(program.programId, fundPda);
    const [sharesMintPda] = deriveSharesMintPda(program.programId, fundPda);
  const [investorPositionPda] = deriveInvestorPositionPda(program.programId, walletPk, fundPda);

  const amountLamports = Math.floor(normalized * LAMPORTS_PER_SOL);
  const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, walletPk);
    const tx = new Transaction();
    const ataInfo = await connection.getAccountInfo(investorWsolAta);
    if (!ataInfo) {
  tx.add(createAssociatedTokenAccountInstruction(walletPk, investorWsolAta, walletPk, NATIVE_MINT));
    }
  tx.add(SystemProgram.transfer({ fromPubkey: walletPk, toPubkey: investorWsolAta, lamports: amountLamports }));
    tx.add(createSyncNativeInstruction(investorWsolAta));

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
  const signature = await sendAndConfirmWithRetry(connection, wallet, tx);
  return signature;
  } finally {
    inflight.delete(opKey);
  }
}
