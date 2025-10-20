import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

type PriceItem = { mint: string; priceBaseUnits: string; updatedAt: number; name?: string };

function maskHelius(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has('api-key')) {
      u.searchParams.set('api-key', '***');
    }
    return u.toString();
  } catch {
    return '[invalid-url]';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  console.log('=== PRICES API START ===');
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.getAll('mints');
    console.log('[step] qs parsed', { rawCount: raw.length });
    const mints = Array.from(new Set(raw.filter(Boolean)));
    console.log('[step] mints deduped', { count: mints.length, mints });
    if (mints.length === 0) {
      console.log('[done] no mints, returning empty list');
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection<{ _id: string; priceBaseUnits?: string; updatedAt?: number; name?: string }>('tokensPrice');
    console.log('[step] mongo connected: Defunds.tokensPrice');

    function getHeliusUrl() {
      const key = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY || '';
      const base = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com');
      return base;
    }
    const heliusUrl = getHeliusUrl();
    console.log('[step] helius url', { url: maskHelius(heliusUrl) });

    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = Number(process.env.PRICE_MAX_TIME_LIMIT || process.env.priceMaxTimeLimit || '300');
    console.log('[step] timing', { nowSec, maxAgeSec });

    // 1) Bulk load cache once
    const cachedDocs = await col.find({ _id: { $in: mints } } as any).toArray();
    const cacheMap = new Map<string, { priceBaseUnits?: string; updatedAt?: number; name?: string }>();
    for (const d of cachedDocs) cacheMap.set((d as any)._id, { priceBaseUnits: (d as any).priceBaseUnits, updatedAt: (d as any).updatedAt, name: (d as any).name });
    console.log('[step] cache bulk loaded', { found: cachedDocs.length });

    // 2) Decide which mints need refresh
    const toFetch: string[] = [];
    for (const mint of mints) {
      const c = cacheMap.get(mint);
      const updatedAt = Number(c?.updatedAt || 0);
      const tooOld = !updatedAt || (nowSec - updatedAt) > maxAgeSec;
      if (!c?.priceBaseUnits || tooOld || !c?.name) toFetch.push(mint);
    }
    console.log('[step] toFetch decided', { count: toFetch.length, toFetch });

    // 3) Fetch Helius for those mints with limited concurrency
    async function fetchOne(mint: string): Promise<{ mint: string; priceBaseUnits?: string; updatedAt?: number; name?: string }> {
      try {
        const payload = { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } };
        const resp = await withTimeout(fetch(heliusUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 4500);
        if (!resp.ok) {
          console.log('[fetch] helius not ok', { mint, status: resp.status });
          return { mint };
        }
        const data: any = await resp.json();
        const tokenInfo = data?.result?.token_info || {};
        const priceInfo = tokenInfo?.price_info || {};
        const pricePerToken = Number(priceInfo?.price_per_token || 0);
        const name = tokenInfo?.symbol || tokenInfo?.name;
        const updatedAt = nowSec;
        const priceBaseUnits = pricePerToken > 0 ? Math.round(pricePerToken * 1_000_000).toString() : undefined;
        return { mint, priceBaseUnits, updatedAt, name };
      } catch (e: any) {
        console.log('[fetch] helius error', { mint, error: e?.message || String(e) });
        return { mint };
      }
    }

    async function limit<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
      const out: R[] = new Array(items.length);
      let i = 0;
      async function worker() {
        while (true) {
          const idx = i++;
          if (idx >= items.length) return;
          out[idx] = await fn(items[idx], idx);
        }
      }
      const workers = Array.from({ length: Math.min(n, items.length) }, () => worker());
      await Promise.all(workers);
      return out;
    }

    const concurrency = Number(process.env.PRICES_FETCH_CONCURRENCY || 3);
    const fetched = await limit(toFetch, concurrency, (m, idx) => fetchOne(m));
    console.log('[step] fetch done', { fetched: fetched.length, concurrency });

    // 4) Bulk upsert fetched prices (only with a price)
    const ops = fetched
      .filter((f) => f.priceBaseUnits)
      .map((f) => ({
        updateOne: {
          filter: { _id: f.mint },
          update: { $set: { priceBaseUnits: f.priceBaseUnits, updatedAt: f.updatedAt, name: f.name } },
          upsert: true,
        }
      }));
    if (ops.length > 0) {
      const res = await col.bulkWrite(ops as any, { ordered: false });
      console.log('[step] bulk upsert complete', { ops: ops.length, modified: res.modifiedCount, upserted: res.upsertedCount });
      // integrate fetched into cacheMap
      for (const f of fetched) {
        if (f.priceBaseUnits) cacheMap.set(f.mint, { priceBaseUnits: f.priceBaseUnits, updatedAt: f.updatedAt, name: f.name });
      }
    } else {
      console.log('[step] nothing to upsert');
    }

    // 5) Build response from cacheMap (plus zeros for missing)
    const items: PriceItem[] = mints.map((mint) => {
      const c = cacheMap.get(mint);
      return { mint, priceBaseUnits: c?.priceBaseUnits || '0', updatedAt: Number(c?.updatedAt || 0), name: c?.name };
    });

    console.log('[done] items ready', { count: items.length, ms: Date.now() - t0 });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e: any) {
    console.error('=== PRICES API ERROR ===', e?.message || String(e));
    return NextResponse.json({ error: 'prices_failed', message: e?.message || String(e) }, { status: 500 });
  } finally {
    console.log('=== PRICES API END ===', { ms: Date.now() - t0 });
  }
}

export function POST() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
