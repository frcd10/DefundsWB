import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { AnchorProvider, Idl, BorshCoder, Wallet } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';

const PROGRAM_ID = new PublicKey('DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd');

async function main() {
  const rpc = process.env.SOLANA_RPC_URL!;
  const managerSecret = process.env.MANAGER_SECRET_BASE58!;
  if (!rpc || !managerSecret) throw new Error('Missing SOLANA_RPC_URL or MANAGER_SECRET_BASE58');
  const connection = new Connection(rpc, 'confirmed');
  const manager = Keypair.fromSecretKey(bs58.decode(managerSecret));
  const wallet: Wallet = {
    publicKey: manager.publicKey,
    async signTransaction(tx) { (tx as any).partialSign(manager); return tx; },
    async signAllTransactions(txs) { txs.forEach((tx: any) => tx.partialSign(manager)); return txs; }
  } as Wallet;
  const provider = new AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });

  const idlPath = path.resolve(__dirname, '../../../../target/idl/managed_funds.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
  const coder = new BorshCoder(idl as any);

  const data = coder.instruction.encode('ping_build', {} as any);
  const keys = [ { pubkey: manager.publicKey, isSigner: true, isWritable: false } ];
  const ix = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys, data });
  const tx = new Transaction().add(ix);
  tx.feePayer = manager.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  console.log('Sending ping_build...');
  const sig = await sendAndConfirmTransaction(connection, tx, [manager], { commitment: 'confirmed' });
  console.log('ping_build signature:', sig);
  console.log('Check logs for build= tag.');
}

main().catch(e => { console.error(e); process.exit(1); });
