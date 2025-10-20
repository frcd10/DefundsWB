import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { loadIdl } from './idl';
import { COMMITMENT } from './constants';

export async function getProgram(connection: Connection, wallet: WalletContextState) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }
  const provider = new AnchorProvider(connection, wallet as any, { commitment: COMMITMENT });
  const idl = await loadIdl();
  return new Program(idl as any, provider);
}

// Reusable send helper with automatic blockhash refresh and one retry on blockhash not found / expired
export async function sendAndConfirmWithRetry(
  connection: Connection,
  wallet: any,
  tx: Transaction,
  opts: { commitment?: string; maxRetries?: number } = {}
): Promise<string> {
  const commitment = opts.commitment || 'confirmed';
  const maxRetries = opts.maxRetries ?? 3;

  let attempt = 0;
  let lastErr: any;
  while (attempt < 2) { // original + 1 retry after fresh blockhash
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
      // preserve original fee payer if set else wallet pk
      if (!tx.feePayer && wallet.publicKey) tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const wireSig = signed.signatures[0].signature ? bs58.encode(signed.signatures[0].signature as Uint8Array) : '';
      try {
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed', maxRetries });

        // Confirm by HTTP polling only (avoid WebSocket onSignature failures in browsers)
        const pollStart = Date.now();
        const pollTimeoutMs = 60_000; // hard stop safety
        while (true) {
          const statuses = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true } as any);
          const st = statuses.value[0];
          if (st) {
            if (st.err) throw new Error('Transaction failed: ' + JSON.stringify(st.err));
            if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') {
              return sig;
            }
          }
          // Check block height expiry window
          const current = await connection.getBlockHeight('finalized');
          if (current > lastValidBlockHeight + 1) {
            // Blockhash window exceeded. The tx may still land; return sig and let server/API verify.
            return sig;
          }
          if (Date.now() - pollStart > pollTimeoutMs) {
            // Give up but return signature so the caller can proceed and server can verify
            return sig;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (e: any) {
        // Idempotent success path
        if (e?.message?.includes('already been processed')) return wireSig;
        if (e?.message?.toLowerCase().includes('blockhash not found') || e?.message?.toLowerCase().includes('expired blockhash')) {
          lastErr = e;
          attempt++;
          continue; // refetch new blockhash and retry send
        }
        throw e;
      }
    } catch (outer) {
      lastErr = outer;
      break;
    }
  }
  throw lastErr || new Error('Failed to send transaction after retry');
}
