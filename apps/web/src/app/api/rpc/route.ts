import { NextRequest, NextResponse } from 'next/server';

// Server-side JSON-RPC proxy to Solana RPC (e.g., Helius), using server env
// Never expose your API key in client-side env. Point clients to /api/rpc instead.

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const target = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com';
    const body = await req.text();

    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Pass through headers that are safe/needed; avoid leaking cookies
      },
      body,
      cache: 'no-store',
      // Node runtime; keepalive okay
    });

    const txt = await upstream.text();
    // Return exact status and payload from upstream to preserve JSON-RPC contract
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