import { NextRequest, NextResponse } from 'next/server';
import { Connection, Commitment } from '@solana/web3.js';

// Server-side JSON-RPC proxy to Solana RPC (e.g., Helius), using server env
// Never expose your API key in client-side env. Point clients to /api/rpc instead.

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const target = (process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com').trim();
    const bodyText = await req.text();
    let json: any = null;
    try { json = JSON.parse(bodyText); } catch {}

    // Fast-path: handle sendRawTransaction via server-side web3.js to avoid provider HTTP quirks
    if (json && json.method === 'sendRawTransaction') {
      const [rawB64, options] = Array.isArray(json.params) ? json.params : [];
      if (!rawB64 || typeof rawB64 !== 'string') {
        return NextResponse.json({ jsonrpc: '2.0', error: { code: -32602, message: 'Invalid params' }, id: json?.id ?? null }, { status: 400 });
      }
      const raw = Buffer.from(rawB64, 'base64');
      const commitment = (options?.preflightCommitment as Commitment) || 'processed';
      const connection = new Connection(target, { commitment });
      try {
        const sig = await connection.sendRawTransaction(raw, {
          skipPreflight: Boolean(options?.skipPreflight),
          maxRetries: typeof options?.maxRetries === 'number' ? options.maxRetries : undefined,
        });
        return NextResponse.json({ jsonrpc: '2.0', result: sig, id: json.id ?? 1 });
      } catch (e: any) {
        return NextResponse.json({ jsonrpc: '2.0', error: { code: -32000, message: e?.message || String(e) }, id: json.id ?? 1 }, { status: 500 });
      }
    }

    // Generic proxy for other JSON-RPC methods
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: bodyText,
      cache: 'no-store',
    });

    const txt = await upstream.text();
    return new NextResponse(txt, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: 500, message: 'proxy error', data: String(e?.message || e) }, id: null },
      { status: 500 }
    );
  }
}

export function GET() {
  // Do not allow GET to avoid accidental exposure/logging of sensitive data
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}