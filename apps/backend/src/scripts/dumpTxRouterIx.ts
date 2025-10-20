import 'dotenv/config';
import { Connection, PublicKey } from '@solana/web3.js';

/*
Option B: Inspect an on-chain transaction signature and dump the Jupiter router instruction:
- Finds the first instruction with programId = JUP6...
- Prints discriminator hex (first 8 bytes), data length, head, and account order.

Usage:
  SOLANA_RPC_URL=... tsx src/scripts/dumpTxRouterIx.ts <txSignature>
*/

function hex(buf: Uint8Array): string { return Buffer.from(buf).toString('hex'); }

async function main() {
  const [sig] = process.argv.slice(2);
  if (!sig) {
    console.error('Usage: tsx src/scripts/dumpTxRouterIx.ts <txSignature>');
    process.exit(1);
  }
  const rpc = process.env.SOLANA_RPC_URL!;
  const conn = new Connection(rpc, 'confirmed');
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' as any });
  if (!tx || !tx.transaction) {
    console.error('Transaction not found');
    process.exit(1);
  }

  const message = tx.transaction.message;
  const keys = (message as any).getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  const router = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

  const compiledIxs: any[] = (message as any).compiledInstructions || (message as any).instructions;
  let found = false;
  for (const ci of compiledIxs) {
    const progIdx: number = ci.programIdIndex;
    const programId: PublicKey = keys.get(progIdx);
    if (programId?.equals(router)) {
      const rawData: any = ci.data;
      const data: Uint8Array = typeof rawData === 'string' ? Buffer.from(rawData, 'base64') : Buffer.from(rawData);
      const discr = data.subarray(0, 8);
      console.log('--- Router CPI from tx ---');
      console.log('programId:', programId.toBase58());
      console.log('discriminatorHex:', hex(discr));
      console.log('dataLen:', data.length);
      console.log('dataHeadHex64:', hex(data.subarray(0, Math.min(64, data.length))));
      const accIdxs: number[] = ci.accountKeyIndexes || ci.accounts;
      console.log('accounts:');
      accIdxs.forEach((idx: number, i: number) => {
        const pk: PublicKey = keys.get(idx);
        console.log(`#${String(i + 1).padStart(2, ' ')} ${pk?.toBase58()}`);
      });
      found = true;
      break;
    }
  }
  if (!found) {
    console.error('Router instruction not found');
    process.exit(1);
  }
}

main();
