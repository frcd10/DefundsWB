import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// Proxy to Jupiter swap-instructions to avoid CORS in browser
export async function POST(req: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const body = await req.json();
    // Sanitize: remove fee params and force useTokenLedger=false for PDA authority swaps
    if (body) {
      if ('feeBps' in body) delete body.feeBps;
      if ('feeAccount' in body) delete body.feeAccount;
      // Some clients nest in swapRequest; handle both shapes defensively
      if (body.swapRequest) {
        if ('feeBps' in body.swapRequest) delete body.swapRequest.feeBps;
        if ('feeAccount' in body.swapRequest) delete body.swapRequest.feeAccount;
        body.swapRequest.useTokenLedger = false;
      }
      body.useTokenLedger = false;
    }
  const upstream = 'https://lite-api.jup.ag/swap/v1/swap-instructions';
    let res: Response | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        res = await fetch(upstream, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'DefundsWB/1.0 (+defunds.app)', 'Accept': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        break;
      } catch (err) {
        lastErr = err;
        if (attempt === 2) throw err;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    if (!res) throw lastErr || new Error('no response');
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) {
      console.error('[jupiter/swap-instructions] upstream non-ok', res.status, data);
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error('[jupiter/swap-instructions] proxy error', e?.message || e);
    return NextResponse.json({ error: 'proxy error', message: e?.message || String(e) }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
