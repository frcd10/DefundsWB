import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, Idl, BN } from '@coral-xyz/anchor';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { normalizeAmount, assertValidAmount } from '@/services/solanaFund/utils/amount';

export type Recipient = { wallet: string; amountSol: number | string };
export type PaymentRecord = { signature: string; totalValue: number; recipients: Recipient[] };

async function getProgram(connection: Connection, wallet: WalletContextState): Promise<Program> {
  const res = await fetch('/managed_funds.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('IDL missing at /managed_funds.json');
  const idl = (await res.json()) as Idl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(idl as any, new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' }));
}

export async function sendBatchedSolPayments(
  wallet: WalletContextState,
  recipients: Recipient[],
  rpcUrl: string
): Promise<PaymentRecord[]> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const connection = new Connection(rpcUrl, 'confirmed');
  const program = await getProgram(connection, wallet);

  const batches: Recipient[][] = [];
  for (let i = 0; i < recipients.length; i += 20) batches.push(recipients.slice(i, i + 20));

  const records: PaymentRecord[] = [];
  for (const batch of batches) {
    // Validate recipients and compute lamports; drop any sub-lamport dust
  const toAccounts: PublicKey[] = [];
  const amountsLamports: number[] = [];
    for (const r of batch) {
      let to: PublicKey;
      try {
        to = new PublicKey(r.wallet);
      } catch {
        throw new Error(`Invalid recipient address: ${r.wallet}`);
      }
      const amt = normalizeAmount(r.amountSol as any);
      assertValidAmount(amt, 'recipient amount');
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);
      if (lamports < 1) continue;
      toAccounts.push(to);
      amountsLamports.push(lamports);
    }

    if (amountsLamports.length === 0) continue; // nothing meaningful to send in this batch

    // Anchor expects Vec<u64> as BN[]; convert to BN to avoid toArrayLike errors
    const amounts = amountsLamports.map((n) => new BN(n.toString()));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ix = await (program as any).methods
      .payRwaInvestors(amounts)
      .accounts({
        manager: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(toAccounts.map((pubkey) => ({ pubkey, isWritable: true, isSigner: false })))
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = wallet.publicKey;
    const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 });
    // Robust confirmation: try standard confirm, then fallback to polling if expired
    try {
      // Using signature-only confirm to avoid blockheight exceeded on slow paths
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore legacy overload
      await connection.confirmTransaction(sig, 'confirmed');
    } catch (err) {
      const msg = (err as Error)?.message || '';
      if (msg.toLowerCase().includes('block height exceeded') || msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('unknown')) {
        // Fallback: poll for status for up to ~60s
        const start = Date.now();
        while (true) {
          const st = await connection.getSignatureStatuses([sig]);
          const status = st?.value?.[0];
          if (status?.err) throw new Error(`On-chain error: ${JSON.stringify(status.err)}`);
          if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') break;
          if ((Date.now() - start) > 60000) throw err;
          await new Promise((res) => setTimeout(res, 1000));
        }
      } else {
        throw err;
      }
    }
  // Build exact amounts from sent lamports for accurate recording
  const recipientsOut: Recipient[] = toAccounts.map((t, i) => ({ wallet: t.toBase58(), amountSol: amountsLamports[i] / LAMPORTS_PER_SOL }));
  const totalSol = recipientsOut.reduce((s, r) => s + (typeof r.amountSol === 'number' ? r.amountSol : normalizeAmount(r.amountSol)), 0);
  records.push({ signature: sig, totalValue: totalSol, recipients: recipientsOut });
  }
  return records;
}
