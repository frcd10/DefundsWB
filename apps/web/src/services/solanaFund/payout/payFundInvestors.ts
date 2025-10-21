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

  const totalLamports = Math.floor(normalizedTotal * LAMPORTS_PER_SOL);
    if (totalLamports <= 0) throw new Error('Total payout amount must be > 0');

    // Optional: Read on-chain Fund account for telemetry only (no blocking).
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fundAcc: any = await (program.account as any).fund.fetch(fundPda);
      const raw = fundAcc?.totalAssets ?? fundAcc?.total_assets ?? 0;
      const totalAssetsLamports = typeof raw === 'object' && raw != null && typeof raw.toNumber === 'function' ? raw.toNumber() : Number(raw || 0);
      if (Number.isFinite(totalAssetsLamports) && totalAssetsLamports > 0 && totalLamports > totalAssetsLamports) {
        console.warn('[payout] requested amount exceeds current total_assets accounting; proceeding (on-chain saturating_sub will handle)');
      }
    } catch {
      // ignore
    }

    // Decide path based on SOL vault PDA balance; if insufficient, attempt to unwrap the Fund's WSOL ATA into SOL first.
    let vaultSolLamports = 0;
    let fundLamports = 0;
    try {
      vaultSolLamports = await connection.getBalance(vaultSolPda);
    } catch {
      vaultSolLamports = 0;
    }
    try {
      fundLamports = await connection.getBalance(fundPda);
    } catch {
      fundLamports = 0;
    }

    // Probe accounts
    const [vaultInfo, vaultSolInfo] = await Promise.all([
      connection.getAccountInfo(vaultPda).catch(() => null),
      connection.getAccountInfo(vaultSolPda).catch(() => null),
    ]);

  // If SOL is short, try to unwrap WSOL from the Fund's WSOL ATA to the SOL vault within this transaction
    const fundWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, fundPda, true);
    const fundWsolInfo = await connection.getAccountInfo(fundWsolAta).catch(() => null);
    let fundWsolLamports = 0;
    if (fundWsolInfo) {
      try {
        const bal = await connection.getTokenAccountBalance(fundWsolAta);
        // amount is in base units (9 decimals) for WSOL, equivalent to lamports
        fundWsolLamports = parseInt(bal.value.amount || '0', 10);
      } catch {
        fundWsolLamports = 0;
      }
    }

    // If we can cover by unwrapping, add unwrap pre-ix and force SOL path
  if (vaultSolLamports < totalLamports && fundWsolLamports > 0 && (vaultSolLamports + fundWsolLamports) >= totalLamports) {
      const unwrapDisc = Uint8Array.from([232, 40, 45, 183, 186, 222, 81, 84]); // unwrap_wsol_fund
      const unwrapIx = new TransactionInstruction({
        programId: program.programId,
        keys: [
          { pubkey: fundPda, isSigner: false, isWritable: true },
          { pubkey: fundWsolAta, isSigner: false, isWritable: true },
          { pubkey: vaultSolPda, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(unwrapDisc),
      });
      preIxs.push(unwrapIx);
      console.log('[payout] prepending unwrap_wsol_fund to top-up SOL vault', { fundWsolAta: fundWsolAta.toBase58(), to: vaultSolPda.toBase58(), wsolLamports: fundWsolLamports });
      // Treat as if SOL vault will have enough post-unwrap
      vaultSolLamports = vaultSolLamports + fundWsolLamports;
    }
    console.log('[payout] preflight:', {
      fund: fundPda.toBase58(),
      vaultPda: vaultPda.toBase58(),
      vaultOwner: vaultInfo?.owner?.toBase58?.() || null,
      vaultDataLen: vaultInfo?.data?.length ?? 0,
      vaultSolPda: vaultSolPda.toBase58(),
      vaultSolLamports,
      fundLamports,
      vaultSolOwner: vaultSolInfo?.owner?.toBase58?.() || null,
    });
    // Always ensure SPL vault exists: prepend repair_vault if missing (required by on-chain account constraints)
    if (!vaultInfo || (vaultInfo.data?.length ?? 0) === 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - coder is internal but available
        const dataRv = program.coder.instruction.encode('repair_vault', {});
        const repairIxAlways = new TransactionInstruction({
          programId: program.programId,
          keys: [
            { pubkey: fundPda, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
          ],
          data: dataRv,
        });
        preIxs.push(repairIxAlways);
        console.log('[payout] vault missing — prepending repair_vault for', vaultPda.toBase58());
      } catch (e) {
        // Fallback: encode manually with discriminator to avoid IDL dependency
        try {
          // Compute Anchor discriminator: sha256("global:repair_vault").slice(0, 8)
          const text = `global:repair_vault`;
          let dataRv: Buffer;
          try {
            const te = new TextEncoder();
            const inputBytes = te.encode(text);
            const cryptoObj: any = (globalThis as any).crypto && (globalThis as any).crypto.subtle
              ? (globalThis as any).crypto
              : (await import('crypto')).webcrypto;
            const ab = new ArrayBuffer(inputBytes.byteLength);
            new Uint8Array(ab).set(inputBytes);
            const digest = await cryptoObj.subtle.digest('SHA-256', ab);
            dataRv = Buffer.from(new Uint8Array(digest).slice(0, 8));
          } catch {
            // Last-resort hardcoded discriminator if WebCrypto not available
            const disc = Uint8Array.from([100, 152, 67, 29, 93, 138, 69, 116]);
            dataRv = Buffer.from(disc);
          }
          const repairIxAlways = new TransactionInstruction({
            programId: program.programId,
            keys: [
              { pubkey: fundPda, isSigner: false, isWritable: true },
              { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
              { pubkey: vaultPda, isSigner: false, isWritable: true },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
              { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
              { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
            ],
            data: dataRv,
          });
          preIxs.push(repairIxAlways);
          console.log('[payout] IDL coder unavailable; using computed repair_vault discriminator');
        } catch (e2) {
          console.warn('[payout] Failed to add repair_vault pre-ix — payout may fail until IDL loads', e2);
        }
      }
    }
    // If vault SOL is short but Fund has lamports, top up the vault from the Fund PDA first
    if (vaultSolLamports < totalLamports && (vaultSolLamports + fundLamports) >= totalLamports) {
      const amountToTopUp = Math.min(totalLamports - vaultSolLamports, fundLamports);
      try {
        // Compute discriminator for pda_lamports_transfer and append u64 amount (LE)
        const text = 'global:pda_lamports_transfer';
        const te = new TextEncoder();
        let discBuf: Buffer;
        try {
          const inputBytes = te.encode(text);
          const cryptoObj: any = (globalThis as any).crypto && (globalThis as any).crypto.subtle
            ? (globalThis as any).crypto
            : (await import('crypto')).webcrypto;
          const ab = new ArrayBuffer(inputBytes.byteLength);
          new Uint8Array(ab).set(inputBytes);
          const digest = await cryptoObj.subtle.digest('SHA-256', ab);
          discBuf = Buffer.from(new Uint8Array(digest).slice(0, 8));
        } catch {
          discBuf = Buffer.from([32, 55, 163, 165, 195, 25, 75, 150]);
        }
        const amountLe = Buffer.from(new (await import('@coral-xyz/anchor')).BN(amountToTopUp).toArray('le', 8));
        const data = Buffer.concat([discBuf, amountLe]);
        const ix = new TransactionInstruction({
          programId: program.programId,
          keys: [
            { pubkey: fundPda, isSigner: false, isWritable: true },
            { pubkey: vaultSolPda, isSigner: false, isWritable: true },
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          ],
          data,
        });
        preIxs.push(ix);
        console.log('[payout] topping up vault SOL from Fund PDA', { amountToTopUp });
        vaultSolLamports += amountToTopUp;
        fundLamports -= amountToTopUp;
      } catch (e) {
        console.warn('[payout] fund->vault top-up failed; continuing with best effort', e);
      }
    }

    const useSolPath = vaultSolLamports >= totalLamports;

    // Deduplicate investor addresses so duplicates don't cause multiple transfers
    const uniqueInvestorAddrs = Array.from(new Set(investorWallets.map((w) => w.toString())));

    // Probe on-chain to include only investors with an existing InvestorPosition PDA
    const posPdas = uniqueInvestorAddrs.map((w) => {
      const investorPk = new PublicKey(w);
      const [positionPda] = deriveInvestorPositionPda(program.programId, investorPk, fundPda);
      return positionPda;
    });
    const posInfos = await connection.getMultipleAccountsInfo(posPdas);
    const validInvestors = uniqueInvestorAddrs.filter((_, i) => !!posInfos[i] && posInfos[i]?.data?.length > 0);
    if (validInvestors.length === 0) {
      throw new Error('No valid investor positions on-chain for this fund');
    }

    if (useSolPath) {
      // SOL path: remaining accounts must be pairs [InvestorPosition, Investor System Account]
      for (const w of validInvestors) {
        const investorPk = new PublicKey(w);
        const [positionPda] = deriveInvestorPositionPda(program.programId, investorPk, fundPda);
        remainingAccounts.push({ pubkey: positionPda, isWritable: false, isSigner: false });
        remainingAccounts.push({ pubkey: investorPk, isWritable: true, isSigner: false });
      }
    } else {
      // WSOL path specifics: ensure ATAs exist and add triples
      // Triples per investor + fee ATAs at the end
      for (const w of validInvestors) {
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
    }

    const discriminator = Uint8Array.from([106, 88, 202, 106, 90, 54, 97, 75]);
    const amountBytes = new (await import('@coral-xyz/anchor')).BN(totalLamports).toArray('le', 8);
    const data = Buffer.concat([Buffer.from(discriminator), Buffer.from(amountBytes)]);

    // No need to initialize SPL vault; we only use SOL path.

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
  console.log('[payout] path=', useSolPath ? 'SOL' : 'WSOL', 'manual account order:', manualKeys.map((k, i) => `${i}: ${k.pubkey.toBase58()} w=${k.isWritable} s=${k.isSigner}`));
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
