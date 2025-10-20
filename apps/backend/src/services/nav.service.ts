import 'dotenv/config'
import fetch from 'node-fetch'
import { PublicKey } from '@solana/web3.js'
import { connection } from '../scripts/helper'
import getClientPromise from '../lib/mongodb'

const ULTRA_API = process.env.ULTRA_JUPITER_QUOTE_API || 'https://lite-api.jup.ag/ultra/'
const PRICE_MAX_AGE_SEC = Number(process.env.PRICE_MAX_TIME_LIMIT || process.env.priceMaxTimeLimit || '300')

type TokenPriceDoc = { _id: string; priceBaseUnits: string; updatedAt: number }
export type TokenPrice = { mint: string; priceBaseUnits: string; updatedAt: number }

// DB-backed cache: Defunds.tokensPrice collection
async function getDb() {
  const client = await getClientPromise()
  return client.db('Defunds')
}

async function readCachedPrice(mint: string): Promise<TokenPrice | null> {
  try {
    const db = await getDb()
    const doc = await db.collection<TokenPriceDoc>('tokensPrice').findOne({ _id: mint })
    if (!doc) return null
    return { mint, priceBaseUnits: String(doc.priceBaseUnits), updatedAt: Number(doc.updatedAt || 0) }
  } catch {
    return null
  }
}

async function writeCachedPrice(p: TokenPrice): Promise<void> {
  try {
    const db = await getDb()
    await db.collection<TokenPriceDoc>('tokensPrice').updateOne(
      { _id: p.mint },
      { $set: { priceBaseUnits: p.priceBaseUnits, updatedAt: p.updatedAt } },
      { upsert: true },
    )
  } catch {}
}

export async function getMintPriceInUsdcBaseUnits(mint: PublicKey): Promise<TokenPrice | null> {
  const k = mint.toBase58()
  const now = Math.floor(Date.now() / 1000)
  const cached = await readCachedPrice(k)
  if (cached && now - cached.updatedAt <= PRICE_MAX_AGE_SEC) return cached

  // Use Jupiter ultra order for pricing
  try {
    // Fetch decimals to quote 1 whole token (per-unit price)
    const parsed = await connection.getParsedAccountInfo(mint)
    const dec = (parsed.value as any)?.data?.parsed?.info?.decimals
    const decimals = typeof dec === 'number' ? dec : 6
    const oneTokenBaseUnits = BigInt(10) ** BigInt(decimals)
  const url = new URL('v1/order', ULTRA_API)
    url.searchParams.set('inputMint', k)
    url.searchParams.set('outputMint', process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    url.searchParams.set('amount', oneTokenBaseUnits.toString())
    url.searchParams.set('taker', process.env.FUND_PUBKEY || '11111111111111111111111111111111')
    const resp = await fetch(url.toString())
    if (!resp.ok) throw new Error(await resp.text())
    const data: any = await resp.json()
    const out = BigInt(data?.outAmount || '0')
    if (out === 0n) return null
    // Store USDC base units per 1 token (per-unit price)
    const price: TokenPrice = { mint: k, priceBaseUnits: out.toString(), updatedAt: now }
    await writeCachedPrice(price)
    return price
  } catch {
    return null
  }
}

export async function computeFundNavInUsdcBaseUnits(fundPda: PublicKey): Promise<bigint> {
  // Enumerate fund token accounts
  const res = await connection.getParsedTokenAccountsByOwner(fundPda, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') })
  let total = 0n
  for (const it of res.value) {
    const info: any = it.account.data
    const mintStr = info.parsed?.info?.mint
    const amountStr = info.parsed?.info?.tokenAmount?.amount
    if (!mintStr || !amountStr) continue
    const mint = new PublicKey(mintStr)
    // Skip shares mint if equals fund.shares_mint; caller should filter in higher-level service if needed
    const amount = BigInt(amountStr)
    if (amount === 0n) continue
    const price = await getMintPriceInUsdcBaseUnits(mint)
    if (!price) continue // treat as zero if not quotable
    // priceBaseUnits is USDC per 1 token base units; multiply by amount and scale by decimals
    const parsedMint = await connection.getParsedAccountInfo(mint)
    const dec = (parsedMint.value as any)?.data?.parsed?.info?.decimals
    const decimals = typeof dec === 'number' ? dec : 6
    const oneTokenBaseUnits = BigInt(10) ** BigInt(decimals)
    total += (BigInt(price.priceBaseUnits) * amount) / oneTokenBaseUnits
  }
  return total
}
