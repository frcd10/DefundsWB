import { NextRequest, NextResponse } from 'next/server';
import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { BorshCoder, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function readIdl(): any {
  const candidates = [
    path.resolve(process.cwd(), '../../target/idl/managed_funds.json'),
    path.resolve(process.cwd(), '../target/idl/managed_funds.json'),
    path.resolve(process.cwd(), 'target/idl/managed_funds.json'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  throw new Error('managed_funds IDL not found');
}

let CACHED_PROGRAM_ID: PublicKey | null = null;
function getProgramId(idl: any): PublicKey {
  if (CACHED_PROGRAM_ID) return CACHED_PROGRAM_ID;
  const fromEnv = (process.env.SOLANA_PROGRAM_ID || '').trim();
  const addr = fromEnv || idl?.address;
  if (!addr) throw new Error('SOLANA_PROGRAM_ID not set and IDL address unavailable');
  CACHED_PROGRAM_ID = new PublicKey(addr);
  return CACHED_PROGRAM_ID;
}

export async function POST(req: NextRequest) {
  try {
    const { investor, fundId, withdrawalStatePk: wsStr, onlyDirectRoutes, excludeDexes, minUsdcBaseUnits } = (await req.json()) as any;
    if (!investor || !fundId) return NextResponse.json({ success: false, error: 'investor and fundId required' }, { status: 400 });

    let investorPk: PublicKey, fundPk: PublicKey, wsPk: PublicKey;
    try { investorPk = new PublicKey(String(investor)); } catch { return NextResponse.json({ success: false, error: 'invalid investor pubkey' }, { status: 400 }); }
    try { fundPk = new PublicKey(String(fundId)); } catch { return NextResponse.json({ success: false, error: 'invalid fundId pubkey' }, { status: 400 }); }

    const endpoint = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(endpoint, { commitment: 'processed' });

    const idl = readIdl();
    const coder = new BorshCoder(idl);
    const PROGRAM_ID = getProgramId(idl);
    const JUP_PROG = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const SOL = new PublicKey('So11111111111111111111111111111111111111112');
    const LITE = (process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/').trim();

    // Resolve withdrawal state PDA if not provided explicitly
    if (wsStr) {
      try { wsPk = new PublicKey(String(wsStr)); } catch { return NextResponse.json({ success: false, error: 'invalid withdrawalStatePk' }, { status: 400 }); }
    } else {
      [wsPk] = await PublicKey.findProgramAddress([Buffer.from('withdrawal'), fundPk.toBuffer(), investorPk.toBuffer()], PROGRAM_ID);
    }

    // Load Fund account to get shares mint
    const fundInfo = await connection.getAccountInfo(fundPk);
    if (!fundInfo?.data) return NextResponse.json({ success: false, error: 'Fund account not found' }, { status: 404 });
    const fundAcc: any = coder.accounts.decode('Fund', fundInfo.data);
    const sharesMint = new PublicKey(fundAcc.shares_mint ?? fundAcc.sharesMint);

    // Enumerate fund-held token accounts (skip shares mint)
    const parsed = await connection.getParsedTokenAccountsByOwner(fundPk, { programId: TOKEN_PROG });

    // Read fraction_bps from WithdrawalState to compute allowed amounts
    const wsInfo = await connection.getAccountInfo(wsPk);
    if (!wsInfo?.data) return NextResponse.json({ success: false, error: 'WithdrawalState not found' }, { status: 404 });
    const wsAcc: any = coder.accounts.decode('WithdrawalState', wsInfo.data);
    const fraction_bps = Number(wsAcc.fraction_bps ?? wsAcc.fractionBps);

    const withAllowed: Array<{ mint: PublicKey; amount: number }> = [];
    for (const { account } of parsed.value) {
      const anyData: any = account.data;
      if (!anyData || anyData.program !== 'spl-token') continue;
      const info = (anyData.parsed?.info || {}) as any;
      const mintStr: string = info.mint;
      const mintPk = new PublicKey(mintStr);
      if (mintPk.equals(sharesMint)) continue;
      const raw: string = info.tokenAmount?.amount ?? '0';
      const have = Number(raw);
      if (!have) continue;
      const allowed = Math.floor((have * fraction_bps) / 1_000_000);
      if (allowed > 0) withAllowed.push({ mint: mintPk, amount: allowed });
    }

    // Optional: filter dust via USDC valuation
    const USDC = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const minUsd = Number(minUsdcBaseUnits || process.env.MIN_USDC_DUST_BASE_UNITS || '100000');
    const quoteToUsdc = async (mint: PublicKey, amt: number) => {
      if (mint.equals(USDC)) return amt;
      try {
        const q = new URL('/swap/v1/quote', LITE);
        q.searchParams.set('inputMint', mint.toBase58());
        q.searchParams.set('outputMint', USDC.toBase58());
        q.searchParams.set('amount', String(amt));
        q.searchParams.set('slippageBps', '2000');
        q.searchParams.set('onlyDirectRoutes', 'false');
        const resp = await fetch(q.toString()); const j = await resp.json();
        return Number(j?.outAmount || 0);
      } catch { return 0; }
    };

    const filtered: Array<{ mint: PublicKey; amount: number }> = [];
    for (const it of withAllowed) {
      const usdc = await quoteToUsdc(it.mint, it.amount);
      if (usdc >= minUsd) filtered.push(it);
    }

    // Helper: decode Jupiter instruction wrapper
    const decodeIx = (instructionPayload: any) => new TransactionInstruction({
      programId: new PublicKey(instructionPayload.programId),
      keys: instructionPayload.accounts.map((k: any) => ({ pubkey: new PublicKey(k.pubkey), isSigner: false, isWritable: k.isWritable })),
      data: Buffer.from(instructionPayload.data, 'base64'),
    });

    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000');
    const SWAP_COMPUTE_UNITS = Number(process.env.SWAP_COMPUTE_UNITS || '600000');
    const addPriority = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS });
    const setCu = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(400_000, SWAP_COMPUTE_UNITS) });

    const LITE_BASE = new URL('/swap/v1/swap-instructions', LITE).toString();
    const results: any[] = [];
    for (const { mint, amount } of filtered) {
      const sourceAta = getAssociatedTokenAddressSync(mint, fundPk, true);
      const destAta = getAssociatedTokenAddressSync(SOL, fundPk, true);

      // Build quote and swap-instructions via Jupiter Lite API
      const q = new URL('/swap/v1/quote', LITE);
      q.searchParams.set('inputMint', mint.toBase58());
      q.searchParams.set('outputMint', SOL.toBase58());
      q.searchParams.set('amount', String(amount));
      q.searchParams.set('slippageBps', '2000');
      q.searchParams.set('onlyDirectRoutes', String(!!onlyDirectRoutes));
      if (excludeDexes) q.searchParams.set('excludeDexes', String(excludeDexes));
      const quote = await fetch(q.toString()).then(r => r.json()).catch(() => null);
      if (!quote?.routePlan?.length) continue;

      const body: any = {
        quoteResponse: quote,
        userPublicKey: fundPk.toBase58(),
        payer: investorPk.toBase58(),
        userSourceTokenAccount: sourceAta.toBase58(),
        userDestinationTokenAccount: destAta.toBase58(),
        wrapAndUnwrapSol: false,
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      };

      const makeSwapReq = async (qr: any) => fetch(LITE_BASE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, quoteResponse: qr }) });

  let j: any = null;
  const swapResp = await makeSwapReq(quote);
      if (!swapResp.ok && !onlyDirectRoutes) {
        // retry with direct routes fallback
        const q2 = new URL('/swap/v1/quote', LITE);
        q2.searchParams.set('inputMint', mint.toBase58()); q2.searchParams.set('outputMint', SOL.toBase58());
        q2.searchParams.set('amount', String(amount)); q2.searchParams.set('slippageBps', '2000'); q2.searchParams.set('onlyDirectRoutes', 'true');
        if (excludeDexes) q2.searchParams.set('excludeDexes', String(excludeDexes));
        const quote2 = await fetch(q2.toString()).then(r => r.json()).catch(() => null);
        if (quote2?.routePlan?.length) {
          const swapResp2 = await makeSwapReq(quote2);
          if (!swapResp2.ok) continue;
          j = await swapResp2.json();
          // use quote2 for params below
          const item = await buildWithdrawSwapTx({ j, quote: quote2, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection });
          results.push(item);
          continue;
        } else {
          continue;
        }
      }
      if (!j) j = await swapResp.json();
      const item = await buildWithdrawSwapTx({ j, quote, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection });
      results.push(item);
    }

    return NextResponse.json({ success: true, data: { items: results } });
  } catch (e: any) {
    console.error('[withdraw/plan] local build error', e);
    return NextResponse.json({ success: false, error: 'Failed to prepare plan', details: e?.message || String(e) }, { status: 500 });
  }
}

// Build a client-signable tx for forwarding Jupiter router via withdraw_swap_instruction
async function buildWithdrawSwapTx(args: { j: any, quote: any, investorPk: PublicKey, fundPk: PublicKey, wsPk: PublicKey, coder: BorshCoder, PROGRAM_ID: PublicKey, JUP_PROG: PublicKey, addPriority: TransactionInstruction, setCu: TransactionInstruction, connection: Connection }) {
  const { j, quote, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection } = args;
  const routerIx = j.swapInstruction;
  const setup = (j.setupInstructions || []) as any[];
  const altsAddrs: string[] = j.addressLookupTableAddresses || [];
  const decode = (x: any) => new TransactionInstruction({ programId: new PublicKey(x.programId), keys: x.accounts.map((k: any) => ({ pubkey: new PublicKey(k.pubkey), isWritable: k.isWritable, isSigner: false })), data: Buffer.from(x.data, 'base64') });
  const setupIxs = setup.map(decode);
  const routerData = Buffer.from(routerIx.data, 'base64');

  const keys = [
    { pubkey: fundPk, isWritable: true, isSigner: false },
    { pubkey: wsPk, isWritable: true, isSigner: false },
    { pubkey: JUP_PROG, isWritable: false, isSigner: false },
    { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    { pubkey: investorPk, isWritable: true, isSigner: true },
  ];
  const data = (coder as any).instruction.encode('withdraw_swap_instruction', {
    router_data: routerData,
    in_amount: new BN(String(quote?.inAmount || 0)),
    out_min_amount: new BN(String(quote?.otherAmountThreshold || 0)),
  });
  const remaining = routerIx.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isWritable: a.isWritable, isSigner: false }));
  const programIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: [...keys, ...remaining], data });

  // Resolve ALTs
  let lookupAccounts: AddressLookupTableAccount[] = [];
  if (altsAddrs.length) {
    const infos = await connection.getMultipleAccountsInfo(altsAddrs.map((a: string) => new PublicKey(a)));
    lookupAccounts = infos.reduce((acc: AddressLookupTableAccount[], info: any, i: number) => {
      if (info) acc.push(new AddressLookupTableAccount({ key: new PublicKey(altsAddrs[i]), state: AddressLookupTableAccount.deserialize(info.data) }));
      return acc;
    }, [] as AddressLookupTableAccount[]);
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriority, setCu, ...setupIxs, programIx] }).compileToV0Message(lookupAccounts);
  const unsignedTx = new VersionedTransaction(msg);
  const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');
  return { txBase64, blockhash, lastValidBlockHeight, addressLookupTableAddresses: altsAddrs };
}

export function GET() { return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 }); }
