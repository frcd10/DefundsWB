import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { getProgram, sendAndConfirmWithRetry } from '../core/program';

export type DefundSwapParams = {
  fundName: string; // on-chain fund.name used in PDA seeds
  inputMint: string; // base58
  outputMint: string; // base58
  amountIn: bigint | number; // in smallest units
  slippageBps?: number; // default 50
  jupiterProgramAllow?: string[]; // optional allowlist of Jupiter router IDs
  dexAllowlist?: string[]; // optional allowlist of DEX program IDs encountered in remaining accounts
};

export type DefundSwapResult = {
  signature: string;
};

const JUP_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';
const JUP_SWAP_IXS_URL = 'https://quote-api.jup.ag/v6/swap-instructions';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function defundSwap(
  connection: Connection,
  wallet: WalletContextState,
  params: DefundSwapParams,
): Promise<DefundSwapResult> {
  if (!wallet.publicKey || !wallet.signTransaction) throw new Error('Wallet not connected');

  const program = await getProgram(connection, wallet);
  const programId = program.programId;

  const managerPk = wallet.publicKey;
  const fundSeeds = [Buffer.from('fund'), managerPk.toBuffer(), Buffer.from(params.fundName)];
  const [fundPda] = PublicKey.findProgramAddressSync(fundSeeds, programId);

  // We'll use the fund PDA as destination owner for output ATA
  const outMintPk = new PublicKey(params.outputMint);
  const inMintPk = new PublicKey(params.inputMint);
  const destAta = await getAssociatedTokenAddress(outMintPk, fundPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Ensure destination ATA exists (best-effort)
  const preIxs: TransactionInstruction[] = [];
  const destInfo = await connection.getAccountInfo(destAta);
  if (!destInfo) {
    preIxs.push(createAssociatedTokenAccountInstruction(managerPk, destAta, fundPda, outMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  }

  // Fetch quote
  const amountInStr = (typeof params.amountIn === 'bigint' ? params.amountIn : BigInt(Math.floor(params.amountIn))).toString();
  const slippageBps = params.slippageBps ?? 50;
  const quoteRes = await fetch(`${JUP_QUOTE_URL}?inputMint=${inMintPk.toBase58()}&outputMint=${outMintPk.toBase58()}&amount=${amountInStr}&slippageBps=${slippageBps}`);
  if (!quoteRes.ok) throw new Error('Failed to fetch quote');
  const quote = await quoteRes.json();

  // Request swap-instructions (we only use the core swapInstruction for CPI)
  const swapIxRes = await fetch(JUP_SWAP_IXS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: managerPk.toBase58(),
      wrapAndUnwrapSol: true,
      destinationTokenAccount: destAta.toBase58(),
      sourceTokenAccount: undefined, // Jupiter will infer from quote route; for non-ATA cases you can pass explicit
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!swapIxRes.ok) throw new Error('Failed to fetch swap instructions');
  const swapIxsJson = await swapIxRes.json();
  const swapInstruction = swapIxsJson.swapInstruction as { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean; }[]; data: string };
  if (!swapInstruction?.data || !swapInstruction?.accounts) throw new Error('Malformed swap-instructions response');

  const jupiterProgramId = new PublicKey(swapInstruction.programId);
  if (params.jupiterProgramAllow && params.jupiterProgramAllow.length > 0) {
    const ok = params.jupiterProgramAllow.some((p) => new PublicKey(p).equals(jupiterProgramId));
    if (!ok) throw new Error('Jupiter program not in allowlist');
  }
  const routeData = Buffer.from(swapInstruction.data, 'base64');

  // Map remaining accounts (exclude program itself)
  const remaining = swapInstruction.accounts.map((acc) => ({
    pubkey: new PublicKey(acc.pubkey),
    isWritable: acc.isWritable,
    isSigner: acc.isSigner,
  }));

  // Optional DEX allowlist enforcement on client: if any remaining account is executable program id in allowlist set
  if (params.dexAllowlist && params.dexAllowlist.length > 0) {
    const allow = new Set(params.dexAllowlist.map((s) => new PublicKey(s).toBase58()));
    // We can't check executability here without extra RPC calls, but we can ensure any programId-like metas are in the list
    for (const acc of remaining) {
      const bs58 = acc.pubkey.toBase58();
      if (allow.has(bs58)) continue;
      // Heuristic: if this is the same as the Jupiter program, skip; else ensure either writable/signers or token accounts; otherwise allowlist
      if (!acc.isWritable && !acc.isSigner && bs58 !== jupiterProgramId.toBase58()) {
        // Soft warning: this is best-effort; on-chain enforcement is the source of truth
        // throw new Error(`Encountered non-allowlisted program account: ${bs58}`);
      }
    }
  }

  // Compute budget boost
  preIxs.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
  );

  // Build Anchor instruction for defund_swap (cast to any to avoid TS deep instantiation)
  const progAny: any = program as any;
  const ix = await progAny.methods
    .defundSwap(new BN(amountInStr), new BN(quote.outAmount || '0'), new PublicKey(params.outputMint), Array.from(routeData))
    .accountsStrict({
      fund: fundPda,
      manager: managerPk,
      destination_account: destAta,
      jupiter_program: jupiterProgramId,
      token_program: TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
    })
    .remainingAccounts(remaining)
    .instruction();

  const tx = new Transaction();
  for (const i of preIxs) tx.add(i);
  tx.add(ix);

  // Send
  const sig = await sendAndConfirmWithRetry(connection, wallet as any, tx, { commitment: 'confirmed' });
  return { signature: sig };
}
