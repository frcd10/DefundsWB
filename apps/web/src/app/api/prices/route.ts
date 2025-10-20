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

    // Fetch each mint, in parallel for small sets
    const items: PriceItem[] = await Promise.all(mints.map(async (mint) => {
      const tMint0 = Date.now();
      try {
        console.log('[mint] start', { mint });
        const cached = await col.findOne({ _id: mint } as any);
        console.log('[mint] cache', { mint, has: !!cached, updatedAt: cached?.updatedAt, price: cached?.priceBaseUnits, name: cached?.name });
        let priceBaseUnits: string | null = cached?.priceBaseUnits || null;
        let updatedAt: number = Number(cached?.updatedAt || 0);
        let name: string | undefined = cached?.name;
        const tooOld = !updatedAt || (nowSec - updatedAt) > maxAgeSec;
        console.log('[mint] cache status', { mint, tooOld, updatedAt });
        if (!priceBaseUnits || tooOld || !name) {
          const payload = { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } };
          console.log('[mint] helius fetch', { mint });
          try {
            const resp = await withTimeout(fetch(heliusUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), 4500);
            console.log('[mint] helius resp', { mint, ok: resp.ok, status: resp.status });
            if (resp.ok) {
              const data: any = await resp.json();
              const tokenInfo = data?.result?.token_info || {};
              const priceInfo = tokenInfo?.price_info || {};
              const pricePerToken = Number(priceInfo?.price_per_token || 0);
              console.log('[mint] helius parsed', { mint, pricePerToken });
              if (pricePerToken > 0) {
                priceBaseUnits = Math.round(pricePerToken * 1_000_000).toString();
                updatedAt = nowSec;
              }
              name = tokenInfo?.symbol || tokenInfo?.name || name;
              if (priceBaseUnits) {
                await col.updateOne({ _id: mint } as any, { $set: { priceBaseUnits, updatedAt, name } }, { upsert: true });
                console.log('[mint] cache upserted', { mint, priceBaseUnits, updatedAt, name });
              }
            } else {
              console.log('[mint] helius not ok', { mint, status: resp.status });
            }
          } catch (e: any) {
            console.log('[mint] helius error', { mint, error: e?.message || String(e) });
          }
        }
        const item: PriceItem = { mint, priceBaseUnits: priceBaseUnits || '0', updatedAt, name };
        console.log('[mint] done', { mint, ms: Date.now() - tMint0, item });
        return item;
      } catch (e: any) {
        console.log('[mint] failed', { mint, error: e?.message || String(e) });
        return { mint, priceBaseUnits: '0', updatedAt: 0 };
      }
    }));

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
