import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, TransactionInstruction } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';
import { deriveVaultPda } from '../utils/pdas';

/**
 * Re-create the Fund's SPL WSOL vault TokenAccount PDA if it was closed.
 * This calls the on-chain initialize_vault instruction. Safe to run multiple times (idempotent).
 */
export async function repairVaultTokenAccount(connection: any, wallet: WalletContextState, fundId: string): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const program = await getProgram(connection, wallet);
  const fundPda = new PublicKey(fundId);
  const [vaultPda] = deriveVaultPda(program.programId, fundPda);

  // initialize_vault discriminator from IDL
  const initVaultDiscriminator = Uint8Array.from([48, 191, 163, 44, 71, 129, 63, 164]);
  const ix = new TransactionInstruction({
    programId: program.programId,
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(initVaultDiscriminator),
  });

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmWithRetry(connection, wallet, tx);
  return sig;
}
