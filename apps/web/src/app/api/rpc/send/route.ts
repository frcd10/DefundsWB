import { NextRequest, NextResponse } from 'next/server';
import { Connection, Commitment } from '@solana/web3.js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const target = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const bodyText = await req.text();
    let json: any = null;
    try { json = JSON.parse(bodyText); } catch {}

    // Accept both JSON-RPC shape and simple shape { txBase64, options }
    let rawB64: string | undefined;
    let options: any = undefined;
    if (json && json.method === 'sendRawTransaction') {
      const [b64, opts] = Array.isArray(json.params) ? json.params : [];
      rawB64 = b64;
      options = opts;
    } else if (json && (json.txBase64 || json.raw)) {
      rawB64 = json.txBase64 || json.raw;
      options = json.options;
    }

    if (!rawB64 || typeof rawB64 !== 'string') {
      return NextResponse.json({ ok: false, error: 'txBase64 missing' }, { status: 400 });
    }

    const raw = Buffer.from(rawB64, 'base64');
    const commitment = (options?.preflightCommitment as Commitment) || 'processed';
    const connection = new Connection(target, { commitment });
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: Boolean(options?.skipPreflight),
      maxRetries: typeof options?.maxRetries === 'number' ? options.maxRetries : undefined,
    });
    return NextResponse.json({ ok: true, signature: sig });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
