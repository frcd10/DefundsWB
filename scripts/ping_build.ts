import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';

// We will construct the ping_build instruction manually using the IDL discriminator to avoid full Anchor client overhead.

(async () => {
  const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const PROGRAM_ID = new PublicKey('DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd');
  const idl = JSON.parse(fs.readFileSync('target/idl/managed_funds.json','utf8'));
  const discriminator = idl.instructions.find((ix: any) => ix.name === 'ping_build')!.discriminator as number[];
  const payerKeypairPath = process.env.ANCHOR_WALLET || process.env.SOLANA_WALLET || `${process.env.HOME}/.config/solana/id_mainnet.json`;
  const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(payerKeypairPath, 'utf8'))));
  const connection = new Connection(RPC, 'confirmed');
  const data = Buffer.from(discriminator);
  const ix = new TransactionInstruction({ keys: [], programId: PROGRAM_ID, data });
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('Ping tx signature:', sig);
  const details = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (details?.meta?.logMessages) {
    console.log('Logs:\n' + details.meta.logMessages.join('\n'));
  } else {
    console.log('No logs found (check commitment / RPC).');
  }
})();
