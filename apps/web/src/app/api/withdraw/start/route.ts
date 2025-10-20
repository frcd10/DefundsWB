import { NextRequest, NextResponse } from 'next/server';
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { BorshCoder, BN } from '@coral-xyz/anchor';
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
    const payload = await req.json();
    const investor = String(payload?.investor || '').trim();
    const fundId = String(payload?.fundId || payload?.fundPda || '').trim();
    const percentRequested = Number(payload?.percentRequested || payload?.percent || 0);

    if (!investor || investor.length < 32) return NextResponse.json({ success: false, error: 'investor is required (base58 pubkey)' }, { status: 400 });
    if (!fundId || fundId.length < 32) return NextResponse.json({ success: false, error: 'fundId is required (fund PDA base58)' }, { status: 400 });
    if (!Number.isFinite(percentRequested) || percentRequested <= 0 || percentRequested > 100) {
      return NextResponse.json({ success: false, error: 'percentRequested must be between 1 and 100' }, { status: 400 });
    }

    let investorPk: PublicKey, fundPk: PublicKey;
    try { investorPk = new PublicKey(investor); } catch { return NextResponse.json({ success: false, error: 'invalid investor pubkey' }, { status: 400 }); }
    try { fundPk = new PublicKey(fundId); } catch { return NextResponse.json({ success: false, error: 'invalid fundId pubkey' }, { status: 400 }); }

    const endpoint = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const connection = new Connection(endpoint, { commitment: 'processed' });

    const idl = readIdl();
    const coder = new BorshCoder(idl);
    const PROGRAM_ID = getProgramId(idl);

    // PDAs
    const [withdrawalStatePk] = await PublicKey.findProgramAddress(
      [Buffer.from('withdrawal'), fundPk.toBuffer(), investorPk.toBuffer()], PROGRAM_ID,
    );
    const [investorPositionPk] = await PublicKey.findProgramAddress(
      [Buffer.from('position'), investorPk.toBuffer(), fundPk.toBuffer()], PROGRAM_ID,
    );

    // Read investor position and compute shares to burn
    const posInfo = await connection.getAccountInfo(investorPositionPk);
    if (!posInfo?.data) return NextResponse.json({ success: false, error: 'Investor position not found' }, { status: 404 });
    const pos: any = coder.accounts.decode('InvestorPosition', posInfo.data);
    const sharesRaw = BigInt(pos.shares?.toString?.() ?? pos.shares ?? 0);
    if (sharesRaw <= BigInt(0)) return NextResponse.json({ success: false, error: 'No shares to withdraw' }, { status: 400 });
    const pct = Math.floor(percentRequested);
    const toBurn = (sharesRaw * BigInt(pct)) / BigInt(100);
    if (toBurn <= BigInt(0)) return NextResponse.json({ success: false, error: 'Computed zero shares for given percent' }, { status: 400 });

    // Instruction: initiate_withdrawal
    const data = (coder as any).instruction.encode('initiate_withdrawal', { shares_to_withdraw: new BN(toBurn.toString()) });
    const keys = [
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: investorPositionPk, isWritable: false, isSigner: false },
      { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
      { pubkey: investorPk, isWritable: true, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ];
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

    // Compute budget
    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000');
    const FINALIZE_COMPUTE_UNITS = Number(process.env.FINALIZE_COMPUTE_UNITS || '300000');
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS });
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) });

    // Build unsigned tx
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriorityFee, modifyComputeUnits, ix] }).compileToV0Message([]);
    const unsignedTx = new VersionedTransaction(msg);
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');

    return NextResponse.json({ success: true, data: { txBase64, blockhash, lastValidBlockHeight, withdrawalStatePk: withdrawalStatePk.toBase58(), investorPositionPk: investorPositionPk.toBase58(), sharesToBurn: toBurn.toString() } });
  } catch (e: any) {
    console.error('[withdraw/start] local build error', e);
    return NextResponse.json({ success: false, error: 'Failed to start withdraw', details: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
