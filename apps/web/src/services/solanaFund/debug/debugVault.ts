import { PublicKey, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import { getProgram } from '../core/program';

export async function debugVault(connection: any, wallet: WalletContextState, fundId: string): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const program = await getProgram(connection, wallet);
  const fundPk = new PublicKey(fundId);
  const decoded: any = await (program.account as any).fund.fetch(fundPk); // eslint-disable-line @typescript-eslint/no-explicit-any
  const baseMint = decoded.baseMint || decoded.base_mint || NATIVE_MINT;
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), fundPk.toBuffer()], program.programId);

  const ix = await (program as any).methods // eslint-disable-line @typescript-eslint/no-explicit-any
    .debugVault()
    .accounts({
      manager: wallet.publicKey,
      fund: fundPk,
      vault: vaultPda,
      baseMint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const signed = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
}
