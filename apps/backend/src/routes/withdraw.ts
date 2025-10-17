import { Router } from 'express'
import { z } from 'zod'
import getClientPromise from '../lib/mongodb'

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
