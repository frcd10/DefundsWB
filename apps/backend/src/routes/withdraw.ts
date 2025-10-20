import { Router } from 'express'
import { z } from 'zod'
import getClientPromise from '../lib/mongodb'
import { AddressLookupTableAccount, ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { AnchorProvider, BorshCoder, BN, Wallet } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
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

    // Ensure Solana service is initialized
    const connection = solanaService.getConnection()
    if (!connection) {
      return res.status(500).json({ success: false, error: 'Solana service not initialized' })
    }

    // Resolve IDL and program id
    const idl = getIdl()
    const coder = new BorshCoder(idl as any)
    const PROGRAM_ID = getProgramId()

    const investorPk = new PublicKey(investor)
    const fundPk = new PublicKey(fundId)

    // Derive withdrawal state PDA
    const [withdrawalStatePk] = await PublicKey.findProgramAddress(
      [Buffer.from('withdrawal'), fundPk.toBuffer(), investorPk.toBuffer()], PROGRAM_ID,
    )

    // Derive investor position PDA and fetch current shares
    const [investorPositionPk] = await PublicKey.findProgramAddress(
      [Buffer.from('position'), investorPk.toBuffer(), fundPk.toBuffer()], PROGRAM_ID,
    )
    const posInfo = await connection.getAccountInfo(investorPositionPk)
    if (!posInfo?.data) return res.status(404).json({ success: false, error: 'Investor position not found' })
    const pos: any = coder.accounts.decode('InvestorPosition', posInfo.data)
    const sharesRaw = BigInt(pos.shares?.toString?.() ?? pos.shares ?? 0)
    if (sharesRaw <= 0n) return res.status(400).json({ success: false, error: 'No shares to withdraw' })
    const toBurn = (sharesRaw * BigInt(Math.floor(percentRequested))) / 100n
    if (toBurn <= 0n) return res.status(400).json({ success: false, error: 'Computed zero shares for given percent' })

    // Build initiate_withdrawal ix
    const data = (coder as any).instruction.encode('initiate_withdrawal', { shares_to_withdraw: new BN(toBurn.toString()) })
    const keys = [
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: investorPositionPk, isWritable: false, isSigner: false },
      { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
      { pubkey: investorPk, isWritable: true, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ]
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data })

    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000')
    const FINALIZE_COMPUTE_UNITS = Number(process.env.FINALIZE_COMPUTE_UNITS || '300000')
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) })

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriorityFee, modifyComputeUnits, ix] }).compileToV0Message([])
    const unsignedTx = new VersionedTransaction(msg)
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')

    return res.json({ success: true, data: { txBase64, blockhash, lastValidBlockHeight, withdrawalStatePk: withdrawalStatePk.toBase58(), investorPositionPk: investorPositionPk.toBase58(), sharesToBurn: toBurn.toString() } })
  } catch (e) {
    console.error('withdraw/start error', e)
    return res.status(500).json({ success: false, error: 'Failed to start withdraw' })
  }
})

// POST /api/withdraw/plan
// Prepares per-mint CPI-forwarded Jupiter router transactions for the investor to sign.
router.post('/plan', async (req, res) => {
  try {
    const { investor, fundId, withdrawalStatePk: wsStr, onlyDirectRoutes, excludeDexes, minUsdcBaseUnits } = (req.body || {}) as any
    if (!investor || !fundId) return res.status(400).json({ success: false, error: 'investor and fundId required' })
    const investorPk = new PublicKey(String(investor))
    const fundPk = new PublicKey(String(fundId))
    const wsPk = wsStr ? new PublicKey(String(wsStr)) : await (async () => (await PublicKey.findProgramAddress([Buffer.from('withdrawal'), fundPk.toBuffer(), investorPk.toBuffer()], getProgramId()))[0])()

    const connection = solanaService.getConnection()
    const idl = getIdl()
    const coder = new BorshCoder(idl as any)
    const PROGRAM_ID = getProgramId()
    const JUP_PROG = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
    const TOKEN_PROG = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
    const SOL = new PublicKey('So11111111111111111111111111111111111111112')
    const LITE = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

    // Fetch fund account for shares mint and manager
    const fundInfo = await connection.getAccountInfo(fundPk)
    if (!fundInfo?.data) return res.status(404).json({ success: false, error: 'Fund account not found' })
    const fundAcc: any = coder.accounts.decode('Fund', fundInfo.data)
    const sharesMint = new PublicKey(fundAcc.shares_mint ?? fundAcc.sharesMint)

    // Enumerate fund-held token accounts (skip shares mint)
    const parsed = await connection.getParsedTokenAccountsByOwner(fundPk, { programId: TOKEN_PROG })
    const decimalsMap = new Map<string, number>()
    const getMintDecimals = async (mint: PublicKey): Promise<number> => {
      const k = mint.toBase58()
      if (decimalsMap.has(k)) return decimalsMap.get(k) as number
      const info = await connection.getParsedAccountInfo(mint)
      const dec = (info.value as any)?.data?.parsed?.info?.decimals
      const decimals = typeof dec === 'number' ? dec : 6
      decimalsMap.set(k, decimals); return decimals
    }

    const withAllowed: Array<{ mint: PublicKey; amount: number }> = []
    // Read fraction_bps/allowed from WithdrawalState
    const wsInfo = await connection.getAccountInfo(wsPk)
    if (!wsInfo?.data) return res.status(404).json({ success: false, error: 'WithdrawalState not found' })
    const wsAcc: any = coder.accounts.decode('WithdrawalState', wsInfo.data)
    const fraction_bps = Number(wsAcc.fraction_bps ?? wsAcc.fractionBps)

    for (const { account } of parsed.value) {
      const anyData: any = account.data
      if (!anyData || anyData.program !== 'spl-token') continue
      const info = (anyData.parsed?.info || {}) as any
      const mintStr: string = info.mint
      const mintPk = new PublicKey(mintStr)
      if (mintPk.equals(sharesMint)) continue
      const raw: string = info.tokenAmount?.amount ?? '0'
      const have = Number(raw)
      if (!have) continue
      const allowed = Math.floor((have * fraction_bps) / 1_000_000)
      if (allowed > 0) withAllowed.push({ mint: mintPk, amount: allowed })
    }

    // Optional: filter dust via USDC valuation
    const USDC = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    const minUsd = Number(minUsdcBaseUnits || process.env.MIN_USDC_DUST_BASE_UNITS || '0')
    const quoteToUsdc = async (mint: PublicKey, amt: number) => {
      if (mint.equals(USDC)) return amt
      try {
        const q = new URL('/swap/v1/quote', LITE)
        q.searchParams.set('inputMint', mint.toBase58())
        q.searchParams.set('outputMint', USDC.toBase58())
        q.searchParams.set('amount', String(amt))
        q.searchParams.set('slippageBps', '2000')
        q.searchParams.set('onlyDirectRoutes', 'false')
        const resp = await fetch(q.toString()); const j = await resp.json();
        return Number(j?.outAmount || 0)
      } catch { return 0 }
    }

    const filtered: Array<{ mint: PublicKey; amount: number }> = []
    for (const it of withAllowed) {
      const usdc = await quoteToUsdc(it.mint, it.amount)
      if (usdc >= minUsd) filtered.push(it)
    }

    // Helper: decode Jupiter instruction wrapper
    const instructionDataToTransactionInstruction = (instructionPayload: any) => {
      if (!instructionPayload) return null
      return new TransactionInstruction({
        programId: new PublicKey(instructionPayload.programId),
        keys: instructionPayload.accounts.map((k: any) => ({ pubkey: new PublicKey(k.pubkey), isSigner: false, isWritable: k.isWritable })),
        data: Buffer.from(instructionPayload.data, 'base64'),
      })
    }

    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000')
    const SWAP_COMPUTE_UNITS = Number(process.env.SWAP_COMPUTE_UNITS || '600000')
    const addPriority = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
    const setCu = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(400_000, SWAP_COMPUTE_UNITS) })

    const results: any[] = []
    for (const { mint, amount } of filtered) {
      const sourceAta = getAssociatedTokenAddressSync(mint, fundPk, true)
      const destAta = getAssociatedTokenAddressSync(SOL, fundPk, true)
      // Build quote and swap-instructions
      const q = new URL('/swap/v1/quote', LITE)
      q.searchParams.set('inputMint', mint.toBase58())
      q.searchParams.set('outputMint', SOL.toBase58())
      q.searchParams.set('amount', String(amount))
      q.searchParams.set('slippageBps', '2000')
      q.searchParams.set('onlyDirectRoutes', String(!!onlyDirectRoutes))
      if (excludeDexes) q.searchParams.set('excludeDexes', String(excludeDexes))
      const quote = await fetch(q.toString()).then(r => r.json())
      if (!quote?.routePlan?.length) continue

      const body: any = {
        quoteResponse: quote,
        userPublicKey: fundPk.toBase58(),
        payer: investorPk.toBase58(),
        userSourceTokenAccount: sourceAta.toBase58(),
        userDestinationTokenAccount: destAta.toBase58(),
        wrapAndUnwrapSol: false,
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }
      const swapResp = await fetch(new URL('/swap/v1/swap-instructions', LITE).toString(), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!swapResp.ok) {
        // retry with direct routes if requested in fallback pattern
        if (!onlyDirectRoutes) {
          const q2 = new URL('/swap/v1/quote', LITE)
          q2.searchParams.set('inputMint', mint.toBase58()); q2.searchParams.set('outputMint', SOL.toBase58())
          q2.searchParams.set('amount', String(amount)); q2.searchParams.set('slippageBps', '2000'); q2.searchParams.set('onlyDirectRoutes', 'true')
          if (excludeDexes) q2.searchParams.set('excludeDexes', String(excludeDexes))
          const quote2 = await fetch(q2.toString()).then(r => r.json()).catch(() => null)
          if (quote2?.routePlan?.length) {
            const swapResp2 = await fetch(new URL('/swap/v1/swap-instructions', LITE).toString(), {
              method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, quoteResponse: quote2 })
            })
            if (!swapResp2.ok) continue
            const j2 = await swapResp2.json();
            results.push(await buildWithdrawSwapTx({ j: j2, quote: quote2, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection }))
            continue
          }
        }
        continue
      }
      const j = await swapResp.json()
      results.push(await buildWithdrawSwapTx({ j, quote, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection }))
    }

    return res.json({ success: true, data: { items: results } })
  } catch (e) {
    console.error('withdraw/plan error', e)
    return res.status(500).json({ success: false, error: 'Failed to prepare plan' })
  }
})

// Build a client-signable tx for forwarding Jupiter router via withdraw_swap_instruction
async function buildWithdrawSwapTx(args: { j: any, quote: any, investorPk: PublicKey, fundPk: PublicKey, wsPk: PublicKey, coder: BorshCoder, PROGRAM_ID: PublicKey, JUP_PROG: PublicKey, addPriority: TransactionInstruction, setCu: TransactionInstruction, connection: any }) {
  const { j, quote, investorPk, fundPk, wsPk, coder, PROGRAM_ID, JUP_PROG, addPriority, setCu, connection } = args
  const routerIx = j.swapInstruction
  const setup = (j.setupInstructions || []) as any[]
  const altsAddrs: string[] = j.addressLookupTableAddresses || []
  const decode = (x: any) => new TransactionInstruction({ programId: new PublicKey(x.programId), keys: x.accounts.map((k: any) => ({ pubkey: new PublicKey(k.pubkey), isWritable: k.isWritable, isSigner: false })), data: Buffer.from(x.data, 'base64') })
  const setupIxs = setup.map(decode)
  const routerData = Buffer.from(routerIx.data, 'base64')

  const keys = [
    { pubkey: fundPk, isWritable: true, isSigner: false },
    { pubkey: wsPk, isWritable: true, isSigner: false },
    { pubkey: JUP_PROG, isWritable: false, isSigner: false },
    { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    { pubkey: investorPk, isWritable: true, isSigner: true },
  ]
  const data = (coder as any).instruction.encode('withdraw_swap_instruction', {
    router_data: routerData,
    in_amount: new BN(String(quote?.inAmount || 0)),
    out_min_amount: new BN(String(quote?.otherAmountThreshold || 0)),
  })
  // Append remaining accounts required by Jupiter
  const remaining = routerIx.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isWritable: a.isWritable, isSigner: false }))
  const programIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: [...keys, ...remaining], data })

  // Resolve ALTs
  let lookupAccounts: AddressLookupTableAccount[] = []
  if (altsAddrs.length) {
    const infos = await connection.getMultipleAccountsInfo(altsAddrs.map((a: string) => new PublicKey(a)))
    lookupAccounts = infos.reduce((acc: AddressLookupTableAccount[], info: any, i: number) => {
      if (info) acc.push(new AddressLookupTableAccount({ key: new PublicKey(altsAddrs[i]), state: AddressLookupTableAccount.deserialize(info.data) }))
      return acc
    }, [])
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriority, setCu, ...setupIxs, programIx] }).compileToV0Message(lookupAccounts)
  const unsignedTx = new VersionedTransaction(msg)
  const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')
  return { txBase64, blockhash, lastValidBlockHeight, addressLookupTableAddresses: altsAddrs }
}

// POST /api/withdraw/unwrap
router.post('/unwrap', async (req, res) => {
  try {
    const { investor, fundId } = (req.body || {}) as any
    if (!investor || !fundId) return res.status(400).json({ success: false, error: 'investor and fundId required' })
    const investorPk = new PublicKey(String(investor))
    const fundPk = new PublicKey(String(fundId))
    const connection = solanaService.getConnection()
    const idl = getIdl(); const coder = new BorshCoder(idl as any)
    const PROGRAM_ID = getProgramId()
    const SOL = new PublicKey('So11111111111111111111111111111111111111112')
    const wsolAta = getAssociatedTokenAddressSync(SOL, fundPk, true)
    const data = (coder as any).instruction.encode('unwrap_wsol_fund', {})
    const keys = [
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: wsolAta, isWritable: true, isSigner: false },
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    ]
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data })
    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000')
    const UNWRAP_COMPUTE_UNITS = Number(process.env.UNWRAP_COMPUTE_UNITS || '200000')
    const addPriority = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
    const setCu = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, UNWRAP_COMPUTE_UNITS) })
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriority, setCu, ix] }).compileToV0Message()
    const unsignedTx = new VersionedTransaction(msg)
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')
    return res.json({ success: true, data: { txBase64, blockhash, lastValidBlockHeight } })
  } catch (e) {
    console.error('withdraw/unwrap error', e)
    return res.status(500).json({ success: false, error: 'unwrap failed' })
  }
})

// POST /api/withdraw/finalize
router.post('/finalize', async (req, res) => {
  try {
    const { investor, fundId } = (req.body || {}) as any
    if (!investor || !fundId) return res.status(400).json({ success: false, error: 'investor and fundId required' })
    const investorPk = new PublicKey(String(investor))
    const fundPk = new PublicKey(String(fundId))
    const PROGRAM_ID = getProgramId()
    const connection = solanaService.getConnection()
    const idl = getIdl(); const coder = new BorshCoder(idl as any)
    const [wsPk] = await PublicKey.findProgramAddress([Buffer.from('withdrawal'), fundPk.toBuffer(), investorPk.toBuffer()], PROGRAM_ID)
    const fundInfo = await connection.getAccountInfo(fundPk)
    if (!fundInfo?.data) return res.status(404).json({ success: false, error: 'Fund not found' })
    const fundAcc: any = coder.accounts.decode('Fund', fundInfo.data)
    const sharesMint = new PublicKey(fundAcc.shares_mint ?? fundAcc.sharesMint)
    const manager = new PublicKey(fundAcc.manager)
    const TREASURY = process.env.TREASURY
    const treasury = TREASURY ? new PublicKey(TREASURY) : manager

    const [investorPosPk] = await PublicKey.findProgramAddress([Buffer.from('position'), investorPk.toBuffer(), fundPk.toBuffer()], PROGRAM_ID)
    const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investorPk, true)
    const data = (coder as any).instruction.encode('finalize_withdrawal', {})
    const keys = [
      { pubkey: fundPk, isWritable: true, isSigner: false },
      { pubkey: investorPosPk, isWritable: true, isSigner: false },
      { pubkey: sharesMint, isWritable: true, isSigner: false },
      { pubkey: investorSharesAta, isWritable: true, isSigner: false },
      { pubkey: wsPk, isWritable: true, isSigner: false },
      { pubkey: investorPk, isWritable: true, isSigner: true },
      { pubkey: manager, isWritable: false, isSigner: false },
      { pubkey: treasury, isWritable: true, isSigner: false },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ]
    const ix = new TransactionInstruction({ programId: PROGRAM_ID, keys, data })
    const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000')
    const FINALIZE_COMPUTE_UNITS = Number(process.env.FINALIZE_COMPUTE_UNITS || '300000')
    const addPriority = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
    const setCu = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) })
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const msg = new TransactionMessage({ payerKey: investorPk, recentBlockhash: blockhash, instructions: [addPriority, setCu, ix] }).compileToV0Message()
    const unsignedTx = new VersionedTransaction(msg)
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')
    return res.json({ success: true, data: { txBase64, blockhash, lastValidBlockHeight } })
  } catch (e) {
    console.error('withdraw/finalize error', e)
    return res.status(500).json({ success: false, error: 'finalize failed' })
  }
})

// Helpers (reused from swap.ts)
let CACHED_PROGRAM_ID: PublicKey | null = null
function getProgramId(): PublicKey {
  if (CACHED_PROGRAM_ID) return CACHED_PROGRAM_ID
  const fromEnv = process.env.SOLANA_PROGRAM_ID
  let addr = fromEnv
  if (!addr) {
    try { const idl = getIdl(); if (idl?.address) addr = idl.address } catch {}
  }
  if (!addr) throw new Error('SOLANA_PROGRAM_ID not set and IDL address unavailable')
  CACHED_PROGRAM_ID = new PublicKey(addr); return CACHED_PROGRAM_ID
}
function getIdl() {
  const repoRoot = path.resolve(__dirname, '../../../..')
  const idlPath = path.join(repoRoot, 'target', 'idl', 'managed_funds.json')
  return JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
}
