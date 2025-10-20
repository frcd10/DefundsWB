import { Request, Response, Router } from 'express';
import { PublicKey } from '@solana/web3.js';
import getClientPromise from '../lib/mongodb';
import fetch from 'node-fetch';

// Helius getAsset-based name + price fetcher with DB upsert
// Collection: Defunds.tokensPrice { _id: mint, priceBaseUnits: string, updatedAt: number, name?: string }

const router = Router();

function getHeliusUrl() {
  const key = process.env.HELIUS_API_KEY || process.env.HELIUS_KEY || '';
  const base = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || (key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : 'https://api.mainnet-beta.solana.com');
  return base;
}

type TokenPriceDoc = { _id: string; priceBaseUnits?: string; updatedAt?: number; name?: string };

router.get('/', async (req: Request, res: Response) => {
  try {
    const raw = req.query.mints;
    const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const mints = (arr as any[]).map((x) => String(x)).filter(Boolean);
    if (!mints.length) { res.json({ items: [] }); return; }
    const db = (await getClientPromise()).db('Defunds');
    const col = db.collection<TokenPriceDoc>('tokensPrice');

    const items: any[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const heliusUrl = getHeliusUrl();

    for (const mint of mints) {
      try {
        // Try cached first
  const cached = await col.findOne({ _id: mint } as any);
        let priceBaseUnits: string | null = cached?.priceBaseUnits || null;
        let updatedAt: number = Number(cached?.updatedAt || 0);
        let name: string | undefined = cached?.name;

        const tooOld = !updatedAt || (nowSec - updatedAt) > Number(process.env.PRICE_MAX_TIME_LIMIT || process.env.priceMaxTimeLimit || '300');
        if (!priceBaseUnits || tooOld || !name) {
          // Fetch from Helius getAsset
          const payload = { jsonrpc: '2.0', id: '1', method: 'getAsset', params: { id: mint } };
          const resp = await fetch(heliusUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (resp.ok) {
            const data: any = await resp.json();
            const tokenInfo = data?.result?.token_info || {};
            const priceInfo = tokenInfo?.price_info || {};
            // price_per_token is in USD; convert to USDC base units (6 decimals)
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
        }
        items.push({ mint, priceBaseUnits: priceBaseUnits || '0', updatedAt, name });
      } catch {
        items.push({ mint, priceBaseUnits: '0', updatedAt: 0 });
      }
    }

    res.json({ items });
  } catch (e) {
    console.error('prices route error', e);
    res.status(500).json({ error: 'prices failed' });
  }
});

export const pricesRoutes = router;
