import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

// Tiny in-memory rate limiter (per process, per IP)
const RL_WINDOW_MS = Number(process.env.PRICES_RATE_WINDOW_MS || 5000); // 5s
const RL_LIMIT = Number(process.env.PRICES_RATE_LIMIT || 15); // 15 req / 5s
type Bucket = { hits: number[] };
const buckets: Map<string, Bucket> = new Map();

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  try {
    const u = new URL(req.url);
    return u.hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function checkRateLimit(ip: string): { allowed: boolean; headers: Record<string, string> } {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b) { b = { hits: [] }; buckets.set(ip, b); }
  // drop old
  while (b.hits.length && (now - b.hits[0]) > RL_WINDOW_MS) b.hits.shift();
  const remaining = Math.max(0, RL_LIMIT - b.hits.length);
  const headers: Record<string, string> = {
    'x-ratelimit-limit': String(RL_LIMIT),
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-window-ms': String(RL_WINDOW_MS),
  };
  if (b.hits.length >= RL_LIMIT) {
    const resetIn = RL_WINDOW_MS - (now - (b.hits[0] || now));
    headers['retry-after'] = String(Math.ceil(resetIn / 1000));
    return { allowed: false, headers };
  }
  b.hits.push(now);
  return { allowed: true, headers };
}

function backendBases(currentHost: string): string[] {
  const bases: string[] = [];
  const envPrimary = (process.env.BACKEND_URL || '').trim();
  const envPublic = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim();
  const pushIfValid = (u: string) => {
    try {
      if (!u) return;
      const fixed = u.replace(/\/$/, '');
      const h = new URL(fixed).host;
      // Avoid self-recursion: don't proxy to the same host we're handling
      if (h && h !== currentHost) bases.push(fixed);
    } catch {
      // ignore invalid URL
    }
  };
  pushIfValid(envPrimary);
  pushIfValid(envPublic);
  // Only include localhost fallbacks when we're running locally
  const isLocal = currentHost.startsWith('localhost') || currentHost.startsWith('127.0.0.1');
  if (isLocal) {
    ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:10000', 'http://127.0.0.1:10000']
      .forEach(pushIfValid);
  }
  return Array.from(new Set(bases));
}

function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      const err: any = new Error(`upstream timeout after ${ms}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

export async function GET(req: NextRequest) {
  // rate limit per IP
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: rl.headers });
  }
  const reqUrl = new URL(req.url);
  const currentHost = reqUrl.host;
  const searchParams = new URLSearchParams(reqUrl.search);
  // Dedupe and softly limit mints to avoid pathological query sizes
  if (searchParams.has('mints')) {
    const unique = Array.from(new Set(searchParams.getAll('mints')));
    const limited = unique.slice(0, 50);
    searchParams.delete('mints');
    for (const m of limited) searchParams.append('mints', m);
  }
  const search = `?${searchParams.toString()}`;
  const bases = backendBases(currentHost);

  // If a backend base is configured, proxy to it (multi-service mode)
  if (bases.length > 0) {
    const errors: { target: string; message: string }[] = [];
    for (const base of bases) {
      const target = `${base}/api/prices${search}`;
      try {
        // Add a short timeout to prevent tying up memory on slow upstreams
        const upstream = await withTimeout(fetch(target, { cache: 'no-store' }), 5000);
        // Stream the response body instead of buffering
        const headers = new Headers();
        const ct = upstream.headers.get('content-type');
        if (ct) headers.set('content-type', ct);
        // Include rate-limit headers for observability
        for (const [k, v] of Object.entries(rl.headers)) headers.set(k, v);
        return new NextResponse(upstream.body, { status: upstream.status, headers });
      } catch (e: any) {
        errors.push({ target, message: e?.message || String(e) });
        continue;
      }
    }
    return NextResponse.json({ error: 'backend-unavailable', details: errors }, { status: 502 });
  }

  // Single-service fallback: compute prices here using Helius and Mongo
  try {
    const raw = searchParams.getAll('mints');
    const mints = Array.from(new Set(raw.filter(Boolean)));
    if (mints.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200, headers: rl.headers });
    }

    const client = await getClientPromise();
    const col = client.db('Defunds').collection<{ _id: string; priceBaseUnits?: string; updatedAt?: number; name?: string }>('tokensPrice');

    function getHeliusUrl() {
      const key = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY || '';
      const base = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com');
      return base;
    }
    const heliusUrl = getHeliusUrl();
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = Number(process.env.PRICE_MAX_TIME_LIMIT || process.env.priceMaxTimeLimit || '300');

    const items: Array<{ mint: string; priceBaseUnits: string; updatedAt: number; name?: string }> = [];
    for (const mint of mints) {
      try {
        const cached = await col.findOne({ _id: mint } as any);
        let priceBaseUnits: string | null = cached?.priceBaseUnits || null;
        let updatedAt: number = Number(cached?.updatedAt || 0);
        let name: string | undefined = cached?.name;
        const tooOld = !updatedAt || (nowSec - updatedAt) > maxAgeSec;
        if (!priceBaseUnits || tooOld || !name) {
          const payload = { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } };
          try {
            const resp = await withTimeout(fetch(heliusUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 4500);
            if (resp.ok) {
              const data: any = await resp.json();
              const tokenInfo = data?.result?.token_info || {};
              const priceInfo = tokenInfo?.price_info || {};
              const pricePerToken = Number(priceInfo?.price_per_token || 0);
              if (pricePerToken > 0) {
                priceBaseUnits = Math.round(pricePerToken * 1_000_000).toString();
                updatedAt = nowSec;
              }
              name = tokenInfo?.symbol || tokenInfo?.name || name;
              if (priceBaseUnits) {
                await col.updateOne({ _id: mint } as any, { $set: { priceBaseUnits, updatedAt, name } }, { upsert: true });
              }
            }
          } catch {
            // ignore timeout/error; fall back to cache if any
          }
        }
        items.push({ mint, priceBaseUnits: priceBaseUnits || '0', updatedAt, name });
      } catch {
        items.push({ mint, priceBaseUnits: '0', updatedAt: 0 });
      }
    }

    return NextResponse.json({ items }, { status: 200, headers: rl.headers });
  } catch (e: any) {
    return NextResponse.json({ error: 'prices_failed', message: e?.message || String(e) }, { status: 500, headers: rl.headers });
  }
}

export function POST() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
