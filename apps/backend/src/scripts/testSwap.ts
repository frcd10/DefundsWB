import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { AnchorProvider, Idl, BN, Wallet, BorshCoder } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';
import { TOKEN_PROGRAM_ID, getAccount, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';

// Local helpers imported from web package compiled output aren't accessible here; re-implement minimal HTTP calls.
const BASE = (process.env.JUPITER_QUOTE_API || process.env.NEXT_PUBLIC_JUPITER_QUOTE_API || 'https://lite-api.jup.ag').replace(/\/$/, '');

async function getQuote(inputMint: string, outputMint: string, amount: string, slippageBps = 2000) {
  const url = `${BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`quote failed ${res.status}`);
  const json: any = await res.json();
  if (!json || !json.outAmount || !json.otherAmountThreshold) throw new Error('bad quote response');
  return json;
}

async function getSwapIx(userPublicKey: string, sourceTokenAccount: string, destinationTokenAccount: string, quoteResponse: any) {
  const res = await fetch(`${BASE}/swap/v1/swap-instructions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userPublicKey, sourceTokenAccount, destinationTokenAccount, quoteResponse }),
  });
  if (!res.ok) throw new Error(`swap-instructions failed ${res.status}`);
  const json: any = await res.json();
  if (!json || !json.swapInstruction || !json.swapInstruction.accounts || !json.swapInstruction.data) throw new Error('bad swap-instructions response');
  const accounts = (json.swapInstruction.accounts as any[]).map((a: any) => ({
    pubkey: new PublicKey(a.pubkey || a.pubKey || a.address),
    isWritable: !!(a.isWritable ?? a.is_writable),
    isSigner: !!(a.isSigner ?? a.is_signer),
  }));
  const data: string = json.swapInstruction.data as string;
  const dataBytes = /^[0-9a-fA-F]+$/.test(data) && data.length % 2 === 0
    ? Uint8Array.from(data.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    : Uint8Array.from(Buffer.from(data, 'base64'));
  return { accounts, data: dataBytes };
}

// Program constants
const PROGRAM_ID = new PublicKey('DEFuNDoMVQ8TnYjDM95bJK55Myr5dmwor43xboG2XQYd');
const JUP_PROGRAM_ID = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');

async function main() {
  const rpc = process.env.SOLANA_RPC_URL!;
  const managerSecret = process.env.MANAGER_SECRET_BASE58!;
  if (!rpc || !managerSecret) throw new Error('Missing SOLANA_RPC_URL or MANAGER_SECRET_BASE58');
  const connection = new Connection(rpc, 'confirmed');

  const manager = Keypair.fromSecretKey(bs58.decode(managerSecret));
  const wallet: Wallet = {
    publicKey: manager.publicKey,
    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
      if ((tx as any).partialSign) {
        (tx as Transaction).partialSign(manager);
      } else if ((tx as any).sign) {
        (tx as VersionedTransaction).sign([manager]);
      }
      return tx;
    },
    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if ((tx as any).partialSign) {
          (tx as Transaction).partialSign(manager);
        } else if ((tx as any).sign) {
          (tx as VersionedTransaction).sign([manager]);
        }
      }
      return txs;
    },
  } as Wallet;
  const provider = new AnchorProvider(connection, wallet, { preflightCommitment: 'confirmed' });

  // Load full IDL from target/idl to ensure account layouts are present for Program ctor
  const idlPath = path.resolve(__dirname, '../../../../target/idl/managed_funds.json');
  const idl: Idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as any;
  const coder = new BorshCoder(idl as any);

  // Hardcode fund context (adjust as needed or parametrize)
  const fundPda = new PublicKey('99c9jpi48swS5SLvT8wN9LPokrcVmgZ5R41uSuo1oRML');
  const sourceAta = new PublicKey('GmvLEAhM97T9AkridswySU3ATgvbnxGwMmUFTwJ9vZDm'); // WSOL vault
  // Compute USDC ATA owned by fund PDA; create if missing
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const destinationAta = getAssociatedTokenAddressSync(USDC_MINT, fundPda, true);

  // Quoting WSOL -> USDC for a tiny amount
  const WSOL = 'So11111111111111111111111111111111111111112';
  const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const amountIn = '10000'; // 0.00001 SOL (in lamports WSOL has 9 decimals; adjust as needed)

  console.log('Fetching quote...');
  const quote = await getQuote(WSOL, USDC, amountIn, 2000);

  // Ensure destination ATA exists and is owned by fund
  try {
    const destAcc = await getAccount(connection, destinationAta);
    if (!destAcc.owner.equals(fundPda)) throw new Error('Destination ATA not owned by fund');
  } catch (e) {
    console.log('Destination ATA missing; creating...');
    const createIx = createAssociatedTokenAccountInstruction(
      manager.publicKey,
      destinationAta,
      fundPda,
      USDC_MINT
    );
    const createTx = new Transaction().add(createIx);
    await sendAndConfirmTransaction(connection, createTx, [manager], { commitment: 'confirmed' });
    console.log('Destination ATA created:', destinationAta.toBase58());
  }

  console.log('Fetching swap-instructions...');
  // IMPORTANT: Use manager as userPublicKey so it can sign Jupiter route; we'll delegate authority to manager on-chain.
  const { accounts, data } = await getSwapIx(manager.publicKey.toBase58(), sourceAta.toBase58(), destinationAta.toBase58(), quote);

  // Build remaining accounts for Anchor (ensure order preserved)
  // Preserve signer flags from Jupiter response (user_transfer_authority must be a signer for CPI).
  const remainingAccounts = accounts.map((a: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }) => ({
    pubkey: a.pubkey,
    isWritable: a.isWritable,
    isSigner: a.isSigner,
  }));

  // Debug print ordered Jupiter accounts
  console.log('Jupiter remaining accounts order:');
  remainingAccounts.forEach((a, i) => {
    console.log(i, a.pubkey.toBase58(), 'writable=', a.isWritable, 'signer=', a.isSigner);
  });

  // Call on-chain swap_tokens
  console.log('Building transaction...');
  // Encode instruction data using IDL
  const dataBuf = coder.instruction.encode('swap_tokens', {
    amount_in: new BN(amountIn),
    minimum_amount_out: new BN(String(quote.otherAmountThreshold)),
    jupiter_ix_data: Buffer.from(data),
  } as any);

  // Debug: compare first 8 bytes with IDL discriminator
  try {
    const idlInstr = (idl as any).instructions.find((i: any) => i.name === 'swap_tokens');
    const idlDisc: number[] | undefined = idlInstr?.discriminator;
    const sentDisc = Array.from(dataBuf.slice(0, 8));
    console.log('swap_tokens discriminator (sent):', sentDisc);
    if (idlDisc) console.log('swap_tokens discriminator (idl): ', idlDisc);
  } catch (_) {}

  // Anchor-declared accounts in order
  const anchorKeys = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: manager.publicKey, isWritable: true, isSigner: true },
    { pubkey: sourceAta, isWritable: true, isSigner: false },
    { pubkey: destinationAta, isWritable: true, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    { pubkey: JUP_PROGRAM_ID, isWritable: false, isSigner: false },
  ];

  const keys = [...anchorKeys, ...remainingAccounts];
  const ix = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys, data: dataBuf });

  const tx = new Transaction().add(ix);

  tx.feePayer = manager.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

  console.log('Sending transaction...');
  const sig = await sendAndConfirmTransaction(connection, tx, [manager], { commitment: 'confirmed' });
  console.log('Swap sent:', sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
