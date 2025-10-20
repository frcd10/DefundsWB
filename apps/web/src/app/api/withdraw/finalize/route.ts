import { NextRequest, NextResponse } from 'next/server';
import { ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { BorshCoder } from '@coral-xyz/anchor';
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
    const { investor, fundId } = (await req.json()) as { investor?: string; fundId?: string };
    if (!investor || !fundId) return NextResponse.json({ success: false, error: 'investor and fundId required' }, { status: 400 });

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

    // Load Fund account to get shares mint and manager
    const fundInfo = await connection.getAccountInfo(fundPk);
    if (!fundInfo?.data) return NextResponse.json({ success: false, error: 'Fund not found' }, { status: 404 });
    const fundAcc: any = coder.accounts.decode('Fund', fundInfo.data);
    const sharesMint = new PublicKey(fundAcc.shares_mint ?? fundAcc.sharesMint);
    const manager = new PublicKey(fundAcc.manager);
    const TREASURY = (process.env.TREASURY || '').trim();
    const treasury = TREASURY ? new PublicKey(TREASURY) : manager;

    // Derive investor's shares ATA
    const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investorPk, true);

    // Encode finalize_withdrawal instruction
    const data = (coder as any).instruction.encode('finalize_withdrawal', {});
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const keys = [
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: investorPositionPk, isWritable: true, isSigner: false },
      { pubkey: sharesMint, isWritable: true, isSigner: false },
      { pubkey: investorSharesAta, isWritable: true, isSigner: false },
      { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
      { pubkey: investorPk, isWritable: true, isSigner: true },
      { pubkey: manager, isWritable: false, isSigner: false },
      { pubkey: treasury, isWritable: true, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ];
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data });

    // Compute budget and priority fee
    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000');
    const FINALIZE_COMPUTE_UNITS = Number(process.env.FINALIZE_COMPUTE_UNITS || '300000');
    const addPriority = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS });
    const setCu = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) });

    // Build unsigned v0 transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriority, setCu, ix] }).compileToV0Message();
    const unsignedTx = new VersionedTransaction(msg);
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64');

    return NextResponse.json({ success: true, data: { txBase64, blockhash, lastValidBlockHeight } });
  } catch (e: any) {
    console.error('[withdraw/finalize] local build error', e);
    return NextResponse.json({ success: false, error: 'finalize failed', details: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() { return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 }); }
