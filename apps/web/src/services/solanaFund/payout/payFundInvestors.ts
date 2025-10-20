import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';
import { normalizeAmount, assertValidAmount } from '../utils/amount';
import { deriveInvestorPositionPda, deriveTempWsolPda, deriveVaultPda, deriveVaultSolPda } from '../utils/pdas';

const inflight = new Set<string>();

export async function payFundInvestors(connection: any, wallet: WalletContextState, fundId: string, totalAmountSol: number | string, investorWallets: string[], treasuryWallet?: string): Promise<string> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const normalizedTotal = normalizeAmount(totalAmountSol as any);
  assertValidAmount(normalizedTotal, 'payout total');
  const opKey = `payout:${fundId}`;
  if (inflight.has(opKey)) throw new Error('A payout is already in progress for this fund. Please wait.');
  inflight.add(opKey);

  try {
    const program = await getProgram(connection, wallet);
    const fundPda = new PublicKey(fundId);
    const [vaultPda] = deriveVaultPda(program.programId, fundPda);
    const [vaultSolPda] = deriveVaultSolPda(program.programId, fundPda);
    const [tempWsolPda] = deriveTempWsolPda(program.programId, fundPda);

    if (!treasuryWallet) throw new Error('Treasury wallet not provided.');
    const treasuryPk = new PublicKey(treasuryWallet);

    const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];
    const preIxs: TransactionInstruction[] = [];

  // Deduplicate investor addresses so duplicates in the investments list
  // don't cause multiple transfers to the same recipient on-chain.
  const uniqueInvestorAddrs = Array.from(new Set(investorWallets.map((w) => w.toString())));
  for (const w of uniqueInvestorAddrs) {
      const investorPk = new PublicKey(w);
      const [positionPda] = deriveInvestorPositionPda(program.programId, investorPk, fundPda);
      const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, investorPk);
      const investorAtaInfo = await connection.getAccountInfo(investorWsolAta);
      if (!investorAtaInfo) {
        preIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, investorWsolAta, investorPk, NATIVE_MINT));
      }
      remainingAccounts.push({ pubkey: positionPda, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: investorPk, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: investorWsolAta, isWritable: true, isSigner: false });
    }

    const treasuryWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, treasuryPk);
    const managerWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
    const [treasuryAtaInfo, managerAtaInfo] = await Promise.all([
      connection.getAccountInfo(treasuryWsolAta),
      connection.getAccountInfo(managerWsolAta),
    ]);
    if (!treasuryAtaInfo) preIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, treasuryWsolAta, treasuryPk, NATIVE_MINT));
    if (!managerAtaInfo) preIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, managerWsolAta, wallet.publicKey, NATIVE_MINT));
    remainingAccounts.push({ pubkey: treasuryWsolAta, isWritable: true, isSigner: false });
    remainingAccounts.push({ pubkey: managerWsolAta, isWritable: true, isSigner: false });

  const totalLamports = Math.floor(normalizedTotal * LAMPORTS_PER_SOL);
    if (totalLamports <= 0) throw new Error('Total payout amount must be > 0');

    const discriminator = Uint8Array.from([106, 88, 202, 106, 90, 54, 97, 75]);
    const amountBytes = new (await import('@coral-xyz/anchor')).BN(totalLamports).toArray('le', 8);
    const data = Buffer.concat([Buffer.from(discriminator), Buffer.from(amountBytes)]);

    const manualKeys = [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: fundPda, isSigner: false, isWritable: true },
      { pubkey: vaultSolPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: tempWsolPda, isSigner: false, isWritable: true },
      { pubkey: treasuryPk, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ...remainingAccounts,
    ];

    // Debug account ordering to help diagnose server error mismatches
    console.log('[payout] manual account order:', manualKeys.map((k, i) => `${i}: ${k.pubkey.toBase58()} w=${k.isWritable} s=${k.isSigner}`));
    const finalIx = new TransactionInstruction({ programId: program.programId, keys: manualKeys, data });
    const tx = new Transaction();
    for (const ix of preIxs) tx.add(ix);
    tx.add(finalIx);
    try {
      const sig = await sendAndConfirmWithRetry(connection, wallet, tx);
      // Fire-and-forget log of payout for analytics/history (invWithdraw collection)
      try {
        // Log minimal payload: fundId, signature, and total amount. Detailed recipients are recorded by the caller when available.
        const payload: any = { fundId, signature: sig, amountSol: normalizedTotal };
        fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/invwithdraw/log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(() => {});
      } catch { /* ignore logging errors */ }
      return sig;
    } catch (e: any) {
      console.error('[payout] error', e);
      if (e.message?.includes('0x1')) {
        throw new Error('Payout failed: insufficient funds in vault SOL account or WSOL fallback path issue');
      }
      if (e.message?.includes('custom program error')) {
        throw new Error('Program rejected payout. Check investor positions and account ordering.');
      }
      throw e;
    }
  } finally {
    inflight.delete(opKey);
  }
}
