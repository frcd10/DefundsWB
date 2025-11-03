import { NextRequest, NextResponse } from 'next/server';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferInstruction } from '@solana/spl-token';
import { BorshCoder, BN } from '@coral-xyz/anchor';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

const JUPITER_PROGRAM = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const LITE_API = (process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag').replace(/\/$/, '');

let CACHED_PROGRAM_ID: PublicKey | null = null;
function getProgramId(idl: any): PublicKey {
  if (CACHED_PROGRAM_ID) return CACHED_PROGRAM_ID;
  const fromEnv = (process.env.SOLANA_PROGRAM_ID || '').trim();
  const addr = fromEnv || idl?.address;
  if (!addr) throw new Error('SOLANA_PROGRAM_ID not set and IDL address unavailable');
  CACHED_PROGRAM_ID = new PublicKey(addr);
  return CACHED_PROGRAM_ID;
}

function readIdl(): any {
  // Try common locations relative to apps/web working directory
  const candidates = [
    path.resolve(process.cwd(), '../../target/idl/managed_funds.json'),
    path.resolve(process.cwd(), '../target/idl/managed_funds.json'),
    path.resolve(process.cwd(), 'target/idl/managed_funds.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {}
  }
  throw new Error('managed_funds IDL not found');
}

function decodeRouterInstruction(ix: any): TransactionInstruction | null {
  if (!ix) return null;
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: (ix.accounts || []).map((k: any) => ({
      pubkey: new PublicKey(k.pubkey ?? k.pubKey ?? k.address),
      isSigner: Boolean(k.isSigner),
      isWritable: Boolean(k.isWritable ?? k.is_writable),
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    // Parse amount as BigInt from string to avoid TS target issues
    const amountStr = String(json?.amountLamports || '0');
    let amountLamports: bigint;
    try {
      amountLamports = BigInt(amountStr);
    } catch {
      return NextResponse.json({ error: 'amountLamports must be a number string' }, { status: 400 });
    }
    const inputMint = String(json?.inputMint || '');
    const outputMint = String(json?.outputMint || '');
    const fundPda = String(json?.fundPda || '');
    const payer = String(json?.payer || '');
    const slippagePercent = Number.isFinite(json?.slippagePercent) ? Number(json.slippagePercent) : 1;

  if (!amountLamports || Number(amountLamports) <= 0) return NextResponse.json({ error: 'amountLamports required' }, { status: 400 });
    if (!inputMint || !outputMint) return NextResponse.json({ error: 'inputMint and outputMint required' }, { status: 400 });
    if (!fundPda) return NextResponse.json({ error: 'fundPda required' }, { status: 400 });
    if (!payer) return NextResponse.json({ error: 'payer required (client wallet pubkey)' }, { status: 400 });
    if (slippagePercent < 0 || slippagePercent > 50) return NextResponse.json({ error: 'slippagePercent must be between 0 and 50' }, { status: 400 });
    const slippageBps = Math.round(slippagePercent * 100);

    const endpoint = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(endpoint, { commitment: 'processed' });

    const idl = readIdl();
    const coder = new BorshCoder(idl);

    const IN_MINT = new PublicKey(inputMint);
    const OUT_MINT = new PublicKey(outputMint);
    const FUND = new PublicKey(fundPda);
    const payerKey = new PublicKey(payer);
    const PROGRAM_ID = getProgramId(idl);

    const sourceAta = getAssociatedTokenAddressSync(IN_MINT, FUND, true);
    const destAta = getAssociatedTokenAddressSync(OUT_MINT, FUND, true);

    const isSolInput = IN_MINT.equals(WSOL_MINT);
    const [sourceInfo, destInfo] = await Promise.all([
      connection.getAccountInfo(sourceAta),
      connection.getAccountInfo(destAta),
    ]);
    const setupIxs: TransactionInstruction[] = [];
    if (!isSolInput && !sourceInfo) {
      setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, sourceAta, FUND, IN_MINT));
    }
    if (!destInfo) {
      setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, destAta, FUND, OUT_MINT));
    }

    const isSellToSol = !isSolInput && OUT_MINT.equals(WSOL_MINT);
    if (isSellToSol) {
      const fundSourceAta = sourceAta;
      const fundDestAta = destAta;
      const managerSourceAta = getAssociatedTokenAddressSync(IN_MINT, payerKey, false);

      const mgrSrcInfo = await connection.getAccountInfo(managerSourceAta);
      if (!mgrSrcInfo) setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, managerSourceAta, payerKey, IN_MINT));

      // Quote
      const q = new URL('/swap/v1/quote', LITE_API);
      q.searchParams.set('inputMint', IN_MINT.toBase58());
      q.searchParams.set('outputMint', OUT_MINT.toBase58());
      q.searchParams.set('amount', String(amountLamports));
      q.searchParams.set('slippageBps', String(slippageBps));
      q.searchParams.set('onlyDirectRoutes', 'false');
      const excludeDexes = (process.env.EXCLUDE_DEXES || 'Simple').trim();
      if (excludeDexes) q.searchParams.set('excludeDexes', excludeDexes);
      const quoteSell = await fetch(q.toString()).then(r => r.json());
      if (!quoteSell?.routePlan?.length) return NextResponse.json({ error: 'no route for sell' }, { status: 400 });

      // Swap-instructions for manager-as-user delivering to Fund WSOL ATA
      const body3: any = {
        quoteResponse: quoteSell,
        userPublicKey: payerKey.toBase58(),
        payer: payerKey.toBase58(),
        userSourceTokenAccount: managerSourceAta.toBase58(),
        destinationTokenAccount: fundDestAta.toBase58(),
        wrapAndUnwrapSol: false,
        prioritizationFeeLamports: 'auto',
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      };
      const swapRes3 = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body3)
      });
      if (!swapRes3.ok) {
        const txt = await swapRes3.text();
        return NextResponse.json({ error: 'swap-instructions (sell) failed', details: txt }, { status: 502 });
      }
      const j3: any = await swapRes3.json();
      const alts3Addrs: string[] = j3.addressLookupTableAddresses || [];
      const alts3Infos = alts3Addrs.length ? await connection.getMultipleAccountsInfo(alts3Addrs.map(a => new PublicKey(a))) : [];
      const lookupAccounts3: AddressLookupTableAccount[] = alts3Infos.reduce((acc: AddressLookupTableAccount[], info, i) => {
        if (info) acc.push(new AddressLookupTableAccount({ key: new PublicKey(alts3Addrs[i]), state: AddressLookupTableAccount.deserialize(info.data) }));
        return acc;
      }, []);

      // Approve manager as delegate on Fund source ATA for amount
      const dataApprove = coder.instruction.encode('pda_token_approve', { amount: new BN(amountLamports.toString()) });
      const keysApprove = [
        { pubkey: FUND, isWritable: true, isSigner: false },
        { pubkey: fundSourceAta, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: payerKey, isWritable: false, isSigner: true },
      ];
      const ixApprove = new TransactionInstruction({ programId: PROGRAM_ID, keys: keysApprove, data: dataApprove });

      const delegatedMoveIx = createTransferInstruction(
        fundSourceAta,
        managerSourceAta,
        payerKey,
        amountLamports,
      );

      const dataRevoke = coder.instruction.encode('pda_token_revoke', {});
      const keysRevoke = [
        { pubkey: FUND, isWritable: true, isSigner: false },
        { pubkey: fundSourceAta, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: payerKey, isWritable: false, isSigner: true },
      ];
      const ixRevoke = new TransactionInstruction({ programId: PROGRAM_ID, keys: keysRevoke, data: dataRevoke });

      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 });
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });

      const decodeMany = (arr: any[]): TransactionInstruction[] => (arr || [])
        .map(decodeRouterInstruction)
        .filter((x): x is TransactionInstruction => Boolean(x));
      const jupSetup = decodeMany(j3.setupInstructions || []);
      const jupSwapIx = decodeRouterInstruction(j3.swapInstruction)!;
      const cleanupRaw = j3.cleanupInstructions || (j3.cleanupInstruction ? [j3.cleanupInstruction] : []);
      const jupCleanup = decodeMany(cleanupRaw);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const msg = new TransactionMessage({
        payerKey,
        recentBlockhash: blockhash,
        instructions: [
          ...setupIxs,
          ixApprove,
          addPriorityFee,
          modifyComputeUnits,
          delegatedMoveIx,
          ...jupSetup,
          jupSwapIx,
          ...jupCleanup,
          ixRevoke,
        ],
      }).compileToV0Message(lookupAccounts3);
      const unsignedTx = new VersionedTransaction(msg);
      const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');
      return NextResponse.json({ txBase64, addressLookupTableAddresses: alts3Addrs, blockhash, lastValidBlockHeight });
    }

    // Generic path: SOL input or SPL->SPL via CPI
    const quoteUrl = new URL('/swap/v1/quote', LITE_API);
    quoteUrl.searchParams.set('inputMint', IN_MINT.toBase58());
    quoteUrl.searchParams.set('outputMint', OUT_MINT.toBase58());
    quoteUrl.searchParams.set('amount', String(amountLamports));
    quoteUrl.searchParams.set('slippageBps', String(slippageBps));
    quoteUrl.searchParams.set('onlyDirectRoutes', 'false');
    const quoteRes = await fetch(quoteUrl.toString());
    if (!quoteRes.ok) return NextResponse.json({ error: 'quote failed' }, { status: 502 });
    const quote: any = await quoteRes.json();
    if (!quote?.routePlan?.length) return NextResponse.json({ error: 'no route' }, { status: 400 });

    const swapReq: any = { quoteResponse: quote, payer, skipUserAccountsRpcCalls: true, useTokenLedger: false, skipAtaCreation: true };
    if (isSolInput) {
      // Manager signs Jupiter route, but we pre-fund the manager from the Fund PDA so that
      // no personal funds are used. This keeps “SOL input” UX while charging the vault.
      swapReq.userPublicKey = payer;
      swapReq.wrapAndUnwrapSol = true;
      swapReq.useSharedAccounts = false;
      swapReq.destinationTokenAccount = destAta.toBase58();
    } else {
      swapReq.userPublicKey = FUND.toBase58();
      swapReq.userSourceTokenAccount = sourceAta.toBase58();
      swapReq.userDestinationTokenAccount = destAta.toBase58();
      swapReq.wrapAndUnwrapSol = false;
      swapReq.useSharedAccounts = false;
    }
    const swapRes = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(swapReq)
    });
    if (!swapRes.ok) {
      const txt = await swapRes.text();
      return NextResponse.json({ error: 'swap-instructions failed', details: txt }, { status: 502 });
    }
    const swapIxs: any = await swapRes.json();

    const routerIx = swapIxs.swapInstruction;
    const setupIxsFromJup: any[] = swapIxs.setupInstructions || [];
    const cleanupIxsFromJup: any[] = swapIxs.cleanupInstructions || (swapIxs.cleanupInstruction ? [swapIxs.cleanupInstruction] : []);
    const addressLookupTableAddresses: string[] = swapIxs.addressLookupTableAddresses || [];

    const swapInstruction = decodeRouterInstruction(routerIx)!;
    if (!isSolInput) {
      for (const k of swapInstruction.keys) {
        if (k.isSigner && k.pubkey.toBase58() === payerKey.toBase58()) {
          k.pubkey = FUND;
          k.isSigner = true;
        }
      }
    }
    const userMeta = swapInstruction.keys.find(k => k.pubkey.toBase58() === FUND.toBase58());
    if (userMeta) userMeta.isSigner = false;

    const routerData = Buffer.from(routerIx.data, 'base64');
    const data = coder.instruction.encode('token_swap_vault', { data: routerData, tmp: Buffer.from('defunds') });
    const keys = [
      { pubkey: FUND, isWritable: true, isSigner: false },
      { pubkey: payerKey, isWritable: false, isSigner: true },
      { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ...swapInstruction.keys,
    ];
    const programIx = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 });
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 });
    const decodeMany = (arr: any[]): TransactionInstruction[] => (arr || [])
      .map(decodeRouterInstruction)
      .filter((x): x is TransactionInstruction => Boolean(x));
    const decodedSetup = decodeMany(setupIxsFromJup);
    const decodedCleanup = decodeMany(cleanupIxsFromJup);

    let lookupAccounts: AddressLookupTableAccount[] = [];
    if (addressLookupTableAddresses.length) {
      const infos = await connection.getMultipleAccountsInfo(addressLookupTableAddresses.map((a: string) => new PublicKey(a)));
      lookupAccounts = infos.reduce((acc: AddressLookupTableAccount[], info, i) => {
        if (info) acc.push(new AddressLookupTableAccount({ key: new PublicKey(addressLookupTableAddresses[i]), state: AddressLookupTableAccount.deserialize(info.data) }));
        return acc;
      }, []);
    }

    // If SOL input, pre-fund the manager wallet from the Fund PDA so the wrap + fees use fund SOL, not personal funds
    let prefundIx: TransactionInstruction | null = null;
    if (isSolInput) {
      const feeBudgetLamports = BigInt(String(process.env.SOL_SWAP_FEE_BUDGET_LAMPORTS || '3000000')); // ~0.003 SOL buffer
      const totalFundOut = (amountLamports as bigint) + feeBudgetLamports;
      const dataPrefund = coder.instruction.encode('pda_lamports_transfer', { amount: new BN(totalFundOut.toString()) });
      const keysPrefund = [
        { pubkey: FUND, isWritable: true, isSigner: false },
        { pubkey: payerKey, isWritable: true, isSigner: false }, // to_system = manager wallet
        { pubkey: payerKey, isWritable: false, isSigner: true }, // manager signer
      ];
      prefundIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: keysPrefund, data: dataPrefund });
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: [
        ...(prefundIx ? [prefundIx] : []),
        ...setupIxs,
        ...decodedSetup,
        addPriorityFee,
        modifyComputeUnits,
        programIx,
        ...decodedCleanup,
      ],
    }).compileToV0Message(lookupAccounts);
    const unsignedTx = new VersionedTransaction(messageV0);
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');
    return NextResponse.json({ txBase64, addressLookupTableAddresses, blockhash, lastValidBlockHeight });
  } catch (e: any) {
    console.error('[swap/vault/prepare] local build error', e);
    return NextResponse.json({ error: 'internal error', details: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}