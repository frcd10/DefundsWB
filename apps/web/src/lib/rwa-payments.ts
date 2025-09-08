import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';

export type Recipient = { wallet: string; amountSol: number };
export type PaymentRecord = { signature: string; totalValue: number; recipients: Recipient[] };

export async function sendBatchedSolPayments(
  wallet: WalletContextState,
  recipients: Recipient[],
  rpcUrl: string
): Promise<PaymentRecord[]> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');
  const connection = new Connection(rpcUrl, 'confirmed');

  const batches: Recipient[][] = [];
  for (let i = 0; i < recipients.length; i += 20) batches.push(recipients.slice(i, i + 20));

  const records: PaymentRecord[] = [];
  for (const batch of batches) {
    // Validate recipients and compute lamports; drop any sub-lamport dust
    const transfers = batch.map((r) => {
      let to: PublicKey;
      try {
        to = new PublicKey(r.wallet);
      } catch {
        throw new Error(`Invalid recipient address: ${r.wallet}`);
      }
      const lamports = Math.floor(r.amountSol * LAMPORTS_PER_SOL);
      return { to, lamports };
    }).filter(t => t.lamports >= 1);

    if (transfers.length === 0) continue; // nothing meaningful to send in this batch


    const tx = new Transaction();
    for (const t of transfers) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: t.to,
          lamports: t.lamports,
        })
      );
    }
    // Prefer wallet.sendTransaction to avoid stale blockhash issues
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
  const recipientsOut: Recipient[] = transfers.map((t) => ({ wallet: t.to.toBase58(), amountSol: t.lamports / LAMPORTS_PER_SOL }));
  const totalSol = recipientsOut.reduce((s, r) => s + r.amountSol, 0);
  records.push({ signature: sig, totalValue: totalSol, recipients: recipientsOut });
  }
  return records;
}
