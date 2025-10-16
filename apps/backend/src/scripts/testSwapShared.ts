import 'dotenv/config';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
const { AnchorProvider, BorshCoder, BN } = anchor as any;
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token';
import { createJupiterApiClient, QuoteGetRequest, SwapInstructionsPostRequest } from '@jup-ag/api';
// Legacy shared swap test removed.
// Supported AMMs and their variant indices in our on-chain enum
const SUPPORTED: Record<string, number> = {
  raydium: 7,
  whirlpool: 17,
  orca: 17,
  saber: 0,
  meteora: 19,
  lifinity: 9,
};
const dexFromLabel = (label: string) => (label.split(' ')[0] || '').toLowerCase();
const isSupported = (label: string) => !!SUPPORTED[dexFromLabel(label)];

(async () => {
  const rpc = process.env.SOLANA_RPC_URL!;
  const managerSecret = process.env.MANAGER_SECRET_BASE58;
  const connection = new Connection(rpc, 'confirmed');
  let manager: Keypair;
  if (managerSecret && managerSecret.length > 0) {
    manager = Keypair.fromSecretKey(bs58.decode(managerSecret));
  } else {
    // Fallback: read from keypair file (default Anchor wallet path) and construct directly
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id_mainnet.json`;
    const raw = fs.readFileSync(keypairPath, 'utf-8');
    const arr: number[] = JSON.parse(raw);
    manager = Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const wallet = { publicKey: manager.publicKey } as any;
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

  // Load program IDL for encoding
  const idlPath = path.resolve(process.cwd(), '..', '..', 'target', 'idl', 'managed_funds.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as any;
  const coder = new BorshCoder(idl);

  // Program + constants
  const PROGRAM_ID = new PublicKey(process.env.SOLANA_PROGRAM_ID!);
  const fundPda = new PublicKey('99c9jpi48swS5SLvT8wN9LPokrcVmgZ5R41uSuo1oRML');
  const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
  const USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const sourceTokenAccount = new PublicKey('GmvLEAhM97T9AkridswySU3ATgvbnxGwMmUFTwJ9vZDm'); // fund-owned WSOL
  const destinationTokenAccount = getAssociatedTokenAddressSync(USDC, fundPda, true);
  const userWsolAta = getAssociatedTokenAddressSync(WSOL, manager.publicKey, false);
  const userUsdcAta = getAssociatedTokenAddressSync(USDC, manager.publicKey, false);

  const slippageBps = 100; // 1%
  // Start from 0.0001 SOL (100000 lamports) then smaller if needed
  const candidateAmounts = ['100000','50000','20000','10000','5000'];
  let quote: any | undefined;
  let amountIn = candidateAmounts[0];
  console.log('Verifying vault token account owner matches fund...');
  const sourceAcc = await connection.getParsedAccountInfo(sourceTokenAccount);
  const ownerKey = (sourceAcc.value as any)?.data?.parsed?.info?.owner;
  if (ownerKey && ownerKey !== fundPda.toBase58()) {
    console.warn(`WARNING: Source token account owner ${ownerKey} != fund PDA ${fundPda.toBase58()}`);
  } else {
    console.log('Source token account owner OK');
  }
  console.log('Fetching quote (shared route) via Jupiter API...');
  const jup = createJupiterApiClient({ basePath: 'https://public.jupiterapi.com' });
  for (const amt of candidateAmounts) {
    amountIn = amt;
    try {
      const req: QuoteGetRequest = {
        inputMint: WSOL.toBase58(),
        outputMint: USDC.toBase58(),
        amount: Number(amt),
        slippageBps,
        onlyDirectRoutes: false,
      } as any;
      const q: any = await jup.quoteGet(req);
      if (!q?.routePlan?.length) throw new Error('No routePlan');
      // Ensure all steps are supported; if not, try excluding the unsupported DEX and refetch
      const steps: any[] = q.routePlan;
      const unsupported = Array.from(new Set(steps.map(s => dexFromLabel(s.swapInfo?.label || '')).filter(d => !SUPPORTED[d])));
      if (unsupported.length > 0) {
        console.log('Excluding unsupported DEXes and retrying quote:', unsupported.join(','));
        const req2: QuoteGetRequest = { ...req, excludeDexes: unsupported.map(d => d.charAt(0).toUpperCase() + d.slice(1)) } as any;
        const q2: any = await jup.quoteGet(req2);
        if (q2?.routePlan?.length) {
          const steps2: any[] = q2.routePlan;
          const unsupported2 = steps2.map(s => dexFromLabel(s.swapInfo?.label || '')).filter(d => !SUPPORTED[d]);
          if (unsupported2.length === 0) { quote = q2; break; }
        }
        // If still unsupported, try next amount
        continue;
      }
      quote = q; break;
    } catch (e: any) {
      console.log(`Quote failed for amount ${amt}: ${e.message}`);
    }
  }
  if (!quote) throw new Error('Unable to get any quote');
  console.log(`Selected quote with ${quote.routePlan.length} step(s)`);
  // Build Vec<SimpleRoutePlanStep>
  const labelToVariantIndex = (label: string): number => {
    const id = dexFromLabel(label);
    const idx = SUPPORTED[id];
    if (!idx) throw new Error(`Unsupported AMM label ${label}`);
    return idx;
  };
  const simpleSteps = quote.routePlan.map((step: any) => {
    const label: string = step.swapInfo?.label || 'Unknown';
    const percent: number = step.percent ?? step.swapInfo?.percent ?? 0;
    const variant = labelToVariantIndex(label);
    // Determine direction flag for Whirlpool/Invariant if provided
    const aToB = step.swapInfo?.aToB ?? true;
    const flags = aToB ? 0x01 : 0x00;
    return {
      percent: percent & 0xff,
      input_index: 0,
      output_index: 1,
      swap_variant: variant & 0xff,
      flags,
    };
  });
  const percentSum = simpleSteps.reduce((a: number, s: { percent: number }) => a + s.percent, 0);
  if (percentSum !== 100) {
    console.log(`Adjusting percent sum from ${percentSum} to 100 (normalizing)`);
    // Normalize by scaling; simple approach
    const scalar = 100 / percentSum;
    let accum = 0;
    for (let i = 0; i < simpleSteps.length; i++) {
      if (i === simpleSteps.length - 1) {
        simpleSteps[i].percent = 100 - accum; // ensure exact
      } else {
        simpleSteps[i].percent = Math.max(1, Math.min(100, Math.round(simpleSteps[i].percent * scalar)));
        accum += simpleSteps[i].percent;
      }
    }
  console.log('Normalized percents:', simpleSteps.map((s: { percent: number }) => s.percent));
  }

  // Find discriminator for swap_tokens_shared
  const ixIdl = (idl as any).instructions.find((i: any) => i.name === 'swap_tokens_shared');
  if (!ixIdl) throw new Error('swap_tokens_shared missing in IDL (rebuild & deploy?)');

  const quotedOutRaw = quote.otherAmountThreshold || (quote.routePlan[quote.routePlan.length - 1]?.swapInfo?.outAmount) || quote.outAmount || '0';
  const data = coder.instruction.encode('swap_tokens_shared', {
    in_amount: new BN(amountIn),
    quoted_out_amount: new BN(quotedOutRaw),
    slippage_bps: slippageBps,
    platform_fee_bps: 0,
    route_steps: simpleSteps,
  } as any);

  // Anchor accounts order for swap_tokens_shared
  // Extra Jupiter metas now required (platform_fee_account, token_2022_program, event_authority, program duplicate)
  const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const JUPITER_PROGRAM = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
  const EVENT_AUTHORITY = new PublicKey('D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf');
  // Placeholder for token_2022_program (not used). Use System Program as sentinel for None.
  const DUMMY_TOKEN_2022 = new PublicKey('11111111111111111111111111111111');
  const PLATFORM_FEE_ACCOUNT = fundPda; // reuse fund for now (fee bps = 0)

  const keys: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: manager.publicKey, isWritable: true, isSigner: true },
    { pubkey: sourceTokenAccount, isWritable: true, isSigner: false },
    { pubkey: destinationTokenAccount, isWritable: true, isSigner: false },
    { pubkey: WSOL, isWritable: false, isSigner: false }, // source_mint
    { pubkey: USDC, isWritable: false, isSigner: false }, // destination_mint
    { pubkey: TOKEN_PROGRAM, isWritable: false, isSigner: false },
    { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
    { pubkey: PLATFORM_FEE_ACCOUNT, isWritable: false, isSigner: false },
    { pubkey: DUMMY_TOKEN_2022, isWritable: false, isSigner: false },
    { pubkey: EVENT_AUTHORITY, isWritable: false, isSigner: false },
    { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false }, // router_program duplicate
  ];

  // Fetch router instruction accounts from Jupiter API and append remaining accounts
  const swapReq: SwapInstructionsPostRequest = {
    swapRequest: {
      quoteResponse: quote as any,
      userPublicKey: manager.publicKey.toBase58(),
      useSharedAccounts: true,
      dynamicComputeUnitLimit: true,
    },
  } as any;
  const swapIxs = await jup.swapInstructionsPost(swapReq);
  const routerIx = swapIxs.swapInstruction!;
  let routerAccounts = routerIx.accounts.map(a => ({
    pubkey: new PublicKey(a.pubkey),
    isWritable: !!a.isWritable,
    // Clear signer flags on outer instruction; PDA will sign via invoke_signed inside our program
    isSigner: false,
  }));
  // Replace critical positions with our shared accounts ordering
  const ensureIndex = (arr: any[], idx: number) => { if (!arr[idx]) throw new Error(`Router accounts missing index ${idx}`); };
  ensureIndex(routerAccounts, 12);
  // 0: token_program
  routerAccounts[0] = { pubkey: TOKEN_PROGRAM, isWritable: false, isSigner: false };
  // 1: program_authority (our fund PDA)
  routerAccounts[1] = { pubkey: fundPda, isWritable: true, isSigner: false };
  // 2: user_transfer_authority (manager EOA signer)
  routerAccounts[2] = { pubkey: manager.publicKey, isWritable: false, isSigner: false };
  // 3: source_token_account (user WSOL ATA)
  routerAccounts[3] = { pubkey: userWsolAta, isWritable: true, isSigner: false };
  // 4: program_source_token_account (fund vault)
  routerAccounts[4] = { pubkey: sourceTokenAccount, isWritable: true, isSigner: false };
  // 5: program_destination_token_account (fund USDC ATA)
  routerAccounts[5] = { pubkey: destinationTokenAccount, isWritable: true, isSigner: false };
  // 6: destination_token_account (user USDC ATA)
  routerAccounts[6] = { pubkey: userUsdcAta, isWritable: true, isSigner: false };
  // 7: source_mint
  routerAccounts[7] = { pubkey: WSOL, isWritable: false, isSigner: false };
  // 8: destination_mint
  routerAccounts[8] = { pubkey: USDC, isWritable: false, isSigner: false };
  // 9: platform_fee_account (keep as returned)
  // 10: token_2022_program
  routerAccounts[10] = { pubkey: DUMMY_TOKEN_2022, isWritable: false, isSigner: false };
  // 11: event_authority
  routerAccounts[11] = { pubkey: EVENT_AUTHORITY, isWritable: false, isSigner: false };
  // 12: router program duplicate
  routerAccounts[12] = { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false };

  // Pass full router accounts (base + extras) so on-chain uses router-provided base ordering
  const extraRouterAccounts = routerAccounts;
  console.log(`Using ${extraRouterAccounts.length} router accounts as remaining accounts (full list)`);
  console.log('Router base overrides:');
  console.log('  [1] program_authority =', routerAccounts[1].pubkey.toBase58());
  console.log('  [2] user_transfer_authority =', routerAccounts[2].pubkey.toBase58());
  console.log('  [3] source_token_account (base) =', routerAccounts[3].pubkey.toBase58());
  console.log('  [4] program_source_token_account =', routerAccounts[4].pubkey.toBase58());
  console.log('  [5] program_destination_token_account =', routerAccounts[5].pubkey.toBase58());
  console.log('  [6] destination_token_account (base) =', routerAccounts[6].pubkey.toBase58());
  keys.push(...extraRouterAccounts);

  const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
  // First ensure ATAs exist in a setup transaction
  const setupTx = new Transaction();
  const userWsolInfo = await connection.getAccountInfo(userWsolAta);
  if (!userWsolInfo) {
    console.log('Creating user WSOL ATA for manager...');
    setupTx.add(createAssociatedTokenAccountInstruction(
      manager.publicKey,
      userWsolAta,
      manager.publicKey,
      WSOL
    ));
  }
  const userUsdcInfo = await connection.getAccountInfo(userUsdcAta);
  if (!userUsdcInfo) {
    console.log('Creating user USDC ATA for manager...');
    setupTx.add(createAssociatedTokenAccountInstruction(
      manager.publicKey,
      userUsdcAta,
      manager.publicKey,
      USDC
    ));
  }
  const destInfo = await connection.getAccountInfo(destinationTokenAccount);
  if (!destInfo) {
    console.log('Creating program USDC ATA (destination vault)...');
    setupTx.add(createAssociatedTokenAccountInstruction(
      manager.publicKey,
      destinationTokenAccount,
      fundPda,
      USDC
    ));
  }
  // Ensure user WSOL ATA has at least the input amount (wrap SOL -> WSOL)
  try {
    const wsolBal = await connection.getTokenAccountBalance(userWsolAta).catch(() => null);
    const have = Number(wsolBal?.value?.amount ?? '0');
    const need = Number(amountIn);
    if (have < need) {
      const topUp = need - have;
      console.log(`Topping up user WSOL ATA with ${topUp} lamports and syncing native...`);
      setupTx.add(
        SystemProgram.transfer({ fromPubkey: manager.publicKey, toPubkey: userWsolAta, lamports: topUp }),
      );
      setupTx.add(createSyncNativeInstruction(userWsolAta));
    }
  } catch (e) {
    console.log('WSOL top-up check failed (continuing):', (e as any)?.message);
  }

  if (setupTx.instructions.length > 0) {
    setupTx.feePayer = manager.publicKey;
    setupTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const setupSig = await sendAndConfirmTransaction(connection, setupTx, [manager], { commitment: 'confirmed' });
    console.log('ATA setup signature:', setupSig);
  }
  // Now build swap tx
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = manager.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Helper to safely fetch token account balance
  async function fetchTokenAccountBalance(pubkey: PublicKey, label: string) {
    try {
      const info = await connection.getTokenAccountBalance(pubkey);
      console.log(`${label} balance:`, info.value.uiAmountString, `(decimals=${info.value.decimals})`);
    } catch (e) {
      console.log(`${label} balance: <unavailable> (${(e as any)?.message})`);
    }
  }

  console.log('Pre-swap balances:');
  await fetchTokenAccountBalance(sourceTokenAccount, 'Source (WSOL vault)');
  await fetchTokenAccountBalance(destinationTokenAccount, 'Destination (USDC vault)');
  await fetchTokenAccountBalance(userWsolAta, 'User WSOL ATA');
  await fetchTokenAccountBalance(userUsdcAta, 'User USDC ATA');

  console.log('Sending shared swap transaction...');
  try {
  const sig = await sendAndConfirmTransaction(connection, tx, [manager], { commitment: 'confirmed', skipPreflight: false });
    console.log('Shared swap signature:', sig);
    console.log('Fetching post-swap balances...');
    await fetchTokenAccountBalance(sourceTokenAccount, 'Source (WSOL vault)');
    await fetchTokenAccountBalance(destinationTokenAccount, 'Destination (USDC vault)');

    // Fetch and display transaction logs for inspection
    const txDetails = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (txDetails?.meta?.logMessages) {
      console.log('--- Transaction Logs ---');
      for (const l of txDetails.meta.logMessages) console.log(l);
      console.log('------------------------');
    } else {
      console.log('No log messages retrieved.');
    }
  } catch (e: any) {
    console.error('Shared swap failed:', e?.transactionMessage || e?.message, e?.transactionLogs || '');
    process.exit(1);
  }
})();
