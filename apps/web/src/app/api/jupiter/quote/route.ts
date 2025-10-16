import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// Simple proxy to Jupiter quote API to avoid browser CORS issues
export async function GET(req: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
  const jupUrl = 'https://lite-api.jup.ag/swap/v1/quote';
    const url = new URL(req.url);
    const params = url.searchParams;
    const upstream = `${jupUrl}?${params.toString()}`;
    // Simple retry loop for transient issues
    let res: Response | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        res = await fetch(upstream, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            'User-Agent': 'DefundsWB/1.0 (+defunds.app)',
            'Accept': 'application/json'
          }
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
    // Try to parse JSON, otherwise wrap raw text
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) {
      console.error('[jupiter/quote] upstream non-ok', res.status, body);
    }
    return NextResponse.json(body, { status: res.status });
  } catch (e: any) {
    console.error('[jupiter/quote] proxy error', e?.message || e);
    return NextResponse.json({ error: 'proxy error', message: e?.message || String(e) }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
