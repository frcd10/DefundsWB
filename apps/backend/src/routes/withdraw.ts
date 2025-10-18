import { Router } from 'express'
import { z } from 'zod'
import getClientPromise from '../lib/mongodb'
import { PublicKey } from '@solana/web3.js'
import { solanaService } from '../services/solana'

const router = Router()

const recordSchema = z.object({
  investor: z.string().min(32), // base58 pubkey
  fundId: z.string().min(1),
  amountSol: z.number().nonnegative(),
  signature: z.string().min(32),
  details: z
    .object({
      perMintSwapSigs: z.array(z.string()).optional(),
      fractionBps: z.number().int().nonnegative().optional(),
      kApplied: z.number().min(0).max(1).optional(),
      percentRequested: z.number().min(0).max(100).optional(),
      performanceFee: z
        .object({ total: z.number().nonnegative(), trader: z.number().nonnegative(), treasury: z.number().nonnegative() })
        .optional(),
      withdrawFee: z.number().nonnegative().optional(),
    })
    .optional(),
})

// POST /api/withdraw/record
// Upserts investor doc by _id and appends a per-fund withdraw entry (does not delete existing data)
router.post('/record', async (req, res) => {
  try {
    const parse = recordSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ success: false, error: 'Invalid payload', details: parse.error.flatten() })
    }
    const { investor, fundId, amountSol, signature, details } = parse.data
    const client = await getClientPromise()
    const db = client.db('Defunds')
  const col = db.collection<any>('invWithdraw')

    const entry = {
      amountSol,
      signature,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    }

    const path = `funds.${fundId}`
    const updateDoc: any = {
      $setOnInsert: { _id: investor },
      $push: { [path]: entry },
      $set: { updatedAt: new Date() },
    }
    const result = await col.updateOne({ _id: investor } as any, updateDoc, { upsert: true })

    return res.json({ success: true, data: { upsertedId: result.upsertedId ?? undefined } })
  } catch (e) {
    console.error('withdraw/record error', e)
    return res.status(500).json({ success: false, error: 'Failed to record withdraw' })
  }
})

export { router as withdrawRoutes }

// Additional route: POST /api/withdraw/start
// This endpoint validates the request and (when enabled) orchestrates the investor withdrawal flow.
// For now, it returns a structured response and can be enabled via ENABLE_WITHDRAW_START=true.
router.post('/start', async (req, res) => {
  try {
    const payload = req.body || {}
    const investor = String(payload.investor || '').trim()
    const fundId = String(payload.fundId || payload.fundPda || '').trim()
    const percentRequested = Number(payload.percentRequested || payload.percent || 0)
    if (!investor || investor.length < 32) return res.status(400).json({ success: false, error: 'investor is required (base58 pubkey)' })
    if (!fundId || fundId.length < 32) return res.status(400).json({ success: false, error: 'fundId is required (fund PDA base58)' })
    if (!Number.isFinite(percentRequested) || percentRequested <= 0 || percentRequested > 100) {
      return res.status(400).json({ success: false, error: 'percentRequested must be between 1 and 100' })
    }

    // Basic sanity on pubkeys
    try { new PublicKey(investor) } catch { return res.status(400).json({ success: false, error: 'invalid investor pubkey' }) }
    try { new PublicKey(fundId) } catch { return res.status(400).json({ success: false, error: 'invalid fundId pubkey' }) }

    // Feature flag: only allow in production when explicitly enabled
    if (process.env.ENABLE_WITHDRAW_START !== 'true') {
      return res.status(503).json({
        success: false,
        error: 'withdraw-start disabled',
        details: 'Set ENABLE_WITHDRAW_START=true on backend to enable. This endpoint will prepare client-signable transactions for initiate/swap/unwrap/finalize in a follow-up update.'
      })
    }

    // Placeholder: ensure Solana service is initialized
    const connection = solanaService.getConnection()
    if (!connection) {
      return res.status(500).json({ success: false, error: 'Solana service not initialized' })
    }

    // Return a job descriptor for now; the UI can poll or proceed with a client-side flow.
    // Future: Prepare unsigned transactions per step to be signed by the investor wallet.
    return res.json({
      success: true,
      accepted: true,
      data: {
        investor,
        fundId,
        percentRequested,
        steps: [],
        note: 'Withdraw orchestration accepted (stub). Transactions preparation to be implemented.'
      }
    })
  } catch (e) {
    console.error('withdraw/start error', e)
    return res.status(500).json({ success: false, error: 'Failed to start withdraw' })
  }
})
