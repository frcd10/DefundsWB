import 'dotenv/config'
import bs58 from 'bs58'
import fetch from 'node-fetch'
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js'
import { AnchorProvider, Wallet, BN, BorshCoder } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import fs from 'fs'
import path from 'path'
import { MongoClient } from 'mongodb'
import { connection, idl, programId, fundPda } from './helper'

// Inputs via env
const INVESTOR_SECRET_BASE58 = process.env.INVESTOR_SECRET_BASE58 || ''
const LITE_API = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

if (!INVESTOR_SECRET_BASE58) {
  console.error('Missing INVESTOR_SECRET_BASE58 in .env')
  process.exit(1)
}

const investorKeypair = (() => {
  const bytes = bs58.decode(INVESTOR_SECRET_BASE58)
  const { Keypair } = require('@solana/web3.js')
  return Keypair.fromSecretKey(bytes, { skipValidation: true })
})()
const investorWallet = new Wallet(investorKeypair)
const provider = new AnchorProvider(connection, investorWallet, { commitment: 'processed' })
const coder = new BorshCoder(idl as any)

const SOL = new PublicKey('So11111111111111111111111111111111111111112')
const USDC = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
const WITHDRAW_SHARES_BASE_UNITS = process.env.WITHDRAW_SHARES_BASE_UNITS
// Tunables
const PRIORITY_MICROLAMPORTS = Number(process.env.PRIORITY_MICROLAMPORTS || '20000') // default 20k
const SWAP_COMPUTE_UNITS = Number(process.env.SWAP_COMPUTE_UNITS || '600000')
const FINALIZE_COMPUTE_UNITS = Number(process.env.FINALIZE_COMPUTE_UNITS || '300000')
const UNWRAP_COMPUTE_UNITS = Number(process.env.UNWRAP_COMPUTE_UNITS || '200000')

async function getFractionBps(withdrawalStatePk: PublicKey) {
  const info = await connection.getAccountInfo(withdrawalStatePk)
  if (!info?.data) throw new Error('WithdrawalState not found')
  const ws: any = coder.accounts.decode('WithdrawalState', info.data)
  return { fraction_bps: Number(ws.fraction_bps ?? ws.fractionBps), total_shares_snapshot: Number(ws.total_shares_snapshot ?? ws.totalSharesSnapshot) }
}

async function getProgressPda(withdrawalStatePk: PublicKey, mint: PublicKey) {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('withdrawal_mint'), withdrawalStatePk.toBuffer(), mint.toBuffer()],
    programId,
  )
  return pda
}

async function getWithdrawalStatePk(investor: PublicKey) {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('withdrawal'), fundPda.toBuffer(), investor.toBuffer()],
    programId,
  )
  return pda
}

async function ensureWithdrawalInitialized(investor: PublicKey, withdrawalStatePk: PublicKey) {
  const exists = await connection.getAccountInfo(withdrawalStatePk)
  if (exists?.data) return

  // Derive investor position PDA
  const [investorPositionPk] = await PublicKey.findProgramAddress(
    [Buffer.from('position'), investor.toBuffer(), fundPda.toBuffer()],
    programId,
  )
  const posInfo = await connection.getAccountInfo(investorPositionPk)
  if (!posInfo?.data) throw new Error('Investor position not found; cannot initiate withdrawal')
  const pos: any = coder.accounts.decode('InvestorPosition', posInfo.data)
  const shares: bigint = BigInt(pos.shares?.toString?.() ?? pos.shares ?? 0)
  const desired = WITHDRAW_SHARES_BASE_UNITS ? BigInt(WITHDRAW_SHARES_BASE_UNITS) : shares
  if (desired <= 0n) throw new Error('No shares to withdraw')

  const { TransactionInstruction } = require('@solana/web3.js')
  const data = (coder as any).instruction.encode('initiate_withdrawal', {
    shares_to_withdraw: new BN(desired.toString()),
  })
  const keys = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: investorPositionPk, isWritable: false, isSigner: false },
    { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
    { pubkey: investor, isWritable: true, isSigner: true },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ]
  const ix = new TransactionInstruction({ programId, keys, data })
  const bh = await connection.getLatestBlockhash()
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) })
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: bh.blockhash, instructions: [addPriorityFee, modifyComputeUnits, ix] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })
}

type JupOpts = { onlyDirectRoutes?: boolean; excludeDexes?: string }

async function jupSwapIxs(inputMint: PublicKey, outputMint: PublicKey, inAmount: number, opts: JupOpts = {}) {
  if (inputMint.equals(outputMint)) {
    return { noop: true }
  }
  // Quote
  const qUrl = new URL('/swap/v1/quote', LITE_API)
  qUrl.searchParams.set('inputMint', inputMint.toBase58())
  qUrl.searchParams.set('outputMint', outputMint.toBase58())
  qUrl.searchParams.set('amount', String(inAmount))
  qUrl.searchParams.set('slippageBps', '2000') // 20% slippage ceiling for safety in volatile routes
  qUrl.searchParams.set('onlyDirectRoutes', String(!!opts.onlyDirectRoutes))
  if (opts.excludeDexes) qUrl.searchParams.set('excludeDexes', opts.excludeDexes)
  const quote = await fetch(qUrl.toString()).then(r => r.json())
  if (!quote || !quote.routePlan?.length) {
    // fallback to allow multi-hop if direct route not available
    const q2 = new URL('/swap/v1/quote', LITE_API)
    q2.searchParams.set('inputMint', inputMint.toBase58())
    q2.searchParams.set('outputMint', outputMint.toBase58())
    q2.searchParams.set('amount', String(inAmount))
    q2.searchParams.set('slippageBps', '2000')
    q2.searchParams.set('onlyDirectRoutes', String(!!opts.onlyDirectRoutes))
    if (opts.excludeDexes) q2.searchParams.set('excludeDexes', opts.excludeDexes)
    const quote2 = await fetch(q2.toString()).then(r => r.json())
    if (!quote2 || !quote2.routePlan?.length) throw new Error('No Jupiter route')
    const swapJson = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote2,
        userPublicKey: fundPda.toBase58(),
        payer: investorWallet.publicKey.toBase58(),
        userSourceTokenAccount: getAssociatedTokenAddressSync(inputMint, fundPda, true).toBase58(),
        userDestinationTokenAccount: getAssociatedTokenAddressSync(outputMint, fundPda, true).toBase58(),
  wrapAndUnwrapSol: false,
        useTokenLedger: false,
        prioritizationFeeLamports: 0,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }),
    }).then(r => r.json())
    return { ...swapJson, quote: quote2 }
  }

  const userSourceTokenAccount = getAssociatedTokenAddressSync(inputMint, fundPda, true)
  const userDestinationTokenAccount = getAssociatedTokenAddressSync(outputMint, fundPda, true)

  // Ledger + Route
  const body: any = {
    quoteResponse: quote,
    userPublicKey: fundPda.toBase58(),
    payer: investorWallet.publicKey.toBase58(),
    userSourceTokenAccount: userSourceTokenAccount.toBase58(),
    userDestinationTokenAccount: userDestinationTokenAccount.toBase58(),
  wrapAndUnwrapSol: false,
    useTokenLedger: false,
    prioritizationFeeLamports: 0,
    useSharedAccounts: false,
    skipUserAccountsRpcCalls: true,
    skipAtaCreation: true,
  }
  let resp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errTxt = await resp.text()
  // Retry once with direct-only to reduce route size
    const q3 = new URL('/swap/v1/quote', LITE_API)
    q3.searchParams.set('inputMint', inputMint.toBase58())
    q3.searchParams.set('outputMint', outputMint.toBase58())
    q3.searchParams.set('amount', String(inAmount))
    q3.searchParams.set('slippageBps', '2000')
    q3.searchParams.set('onlyDirectRoutes', 'true')
    if (opts.excludeDexes) q3.searchParams.set('excludeDexes', opts.excludeDexes)
    const quote3 = await fetch(q3.toString()).then(r => r.json()).catch(() => null)
    if (quote3?.routePlan?.length) {
      const body2 = { ...body, quoteResponse: quote3 }
      resp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2),
      })
      if (!resp.ok) throw new Error(errTxt)
      const data2 = await resp.json()
      return { ...data2, quote: quote3 }
    }
    throw new Error(errTxt)
  }
  const data = await resp.json()
  return { ...data, quote }
}

// Get expected USDC out for valuing dust thresholds
async function quoteToUsdc(inputMint: PublicKey, inAmount: number): Promise<number> {
  if (inputMint.equals(USDC)) return inAmount // same mint, 1:1 in base units
  try {
    const qUrl = new URL('/swap/v1/quote', LITE_API)
    qUrl.searchParams.set('inputMint', inputMint.toBase58())
    qUrl.searchParams.set('outputMint', USDC.toBase58())
    qUrl.searchParams.set('amount', String(inAmount))
    qUrl.searchParams.set('slippageBps', '2000')
    qUrl.searchParams.set('onlyDirectRoutes', 'false') // allow multi-hop for valuation
    const quote = await fetch(qUrl.toString()).then(r => r.json())
    const out = Number(quote?.outAmount ?? 0)
    return isFinite(out) ? out : 0
  } catch {
    return 0
  }
}

async function callWithdrawSwapInstruction(withdrawalStatePk: PublicKey, inputMint: PublicKey, inAmount: number, jup: any) {
  if ((jup as any).noop) return null
  const ledgerIx = (jup as any).tokenLedgerInstruction
  const routeIx = jup.swapInstruction
  const addressLookupTableAddresses = jup.addressLookupTableAddresses || []

  const toDataBuffer = (d: any): Buffer => {
    if (!d) return Buffer.alloc(0)
    if (typeof d === 'string') return Buffer.from(d, 'base64')
    if (Array.isArray(d)) return Buffer.from(d)
    if (d?.type === 'Buffer' && Array.isArray(d?.data)) return Buffer.from(d.data)
    if (d?.data && typeof d.data === 'string') return Buffer.from(d.data, 'base64')
    try { return Buffer.from(d) } catch { return Buffer.alloc(0) }
  }
  // In CPI mode we do not include Jupiter setup/cleanup as top-level instructions.

  const toIx = async (inner: any, routerData: Buffer, outMin: number) => {
    const { TransactionInstruction, PublicKey } = require('@solana/web3.js')
    const keys: any[] = [
      // Order must match Accounts in on-chain instruction
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
      { pubkey: new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'), isWritable: false, isSigner: false },
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      { pubkey: investorWallet.publicKey, isWritable: true, isSigner: true },
    ]
    // Append Jupiter router accounts as remaining_accounts; avoid marking any as signer
    const routerAccounts = inner.accounts.map((a: any) => ({
      pubkey: new PublicKey(a.pubkey),
      isWritable: !!a.isWritable,
      // IMPORTANT: never mark remaining accounts as signer at top-level.
      // The CPI will mark the fund PDA as signer internally via invoke_signed.
      isSigner: false,
    }))
    keys.push(...routerAccounts)
    const data = (coder as any).instruction.encode('withdraw_swap_instruction', {
      router_data: routerData,
      in_amount: new BN(inAmount),
      out_min_amount: new BN(outMin),
    })
      return new TransactionInstruction({ programId, keys, data })
  }

  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(400_000, SWAP_COMPUTE_UNITS) })
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })

  const blockhash = await connection.getLatestBlockhash()

  const ixs = [] as any[]
  ixs.push(addPriorityFee, modifyComputeUnits)

  const routeData = toDataBuffer(routeIx.data)
  const outMin = Number(jup?.quote?.otherAmountThreshold || 0)
  // Prepend any Jupiter setup instructions
  for (const si of ((jup.setupInstructions as any[]) || [])) {
    const { instructionDataToTransactionInstruction } = await import('./helper')
    const sIx = instructionDataToTransactionInstruction(si)
    if (sIx) ixs.push(sIx)
  }
  ixs.push(await toIx(routeIx, routeData, outMin))
  // Do not include cleanup when wrapAndUnwrapSol=false; not required and can add signer constraints
  // Resolve Jupiter-provided Address Lookup Tables to reduce key list size
  let altAccounts: any[] = []
  if (addressLookupTableAddresses.length) {
    const lookups = await Promise.all(
      addressLookupTableAddresses.map(async (addr: string) => {
        try { return (await connection.getAddressLookupTable(new PublicKey(addr))).value } catch { return null }
      })
    )
    altAccounts = lookups.filter((v: any) => !!v)
  }

  const msg = new TransactionMessage({ payerKey: investorWallet.publicKey, recentBlockhash: blockhash.blockhash, instructions: ixs }).compileToV0Message(altAccounts as any)
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  const sig = await execTx(tx, { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight })
  return sig as string
}

;(async () => {
  // Helper: fetch mint decimals with cache
  const decimalsCache = new Map<string, number>()
  const getMintDecimals = async (mint: PublicKey): Promise<number> => {
    const k = mint.toBase58()
    if (decimalsCache.has(k)) return decimalsCache.get(k) as number
    const info = await connection.getParsedAccountInfo(mint)
    const dec = (info.value as any)?.data?.parsed?.info?.decimals
    const decimals = typeof dec === 'number' ? dec : 6
    decimalsCache.set(k, decimals)
    return decimals
  }
  const investor = investorWallet.publicKey
  const withdrawalStatePk = await getWithdrawalStatePk(investor)
  await ensureWithdrawalInitialized(investor, withdrawalStatePk)
  const { fraction_bps } = await getFractionBps(withdrawalStatePk)

  // Fetch Fund account to get shares mint and manager
  const fundInfo = await connection.getAccountInfo(fundPda)
  if (!fundInfo?.data) throw new Error('Fund account not found')
  const fundAcc: any = coder.accounts.decode('Fund', fundInfo.data)
  const sharesMint: PublicKey = new PublicKey(fundAcc.shares_mint ?? fundAcc.sharesMint)
  const fundManager: PublicKey = new PublicKey(fundAcc.manager)
  const TREASURY = process.env.TREASURY
  const treasuryPk = TREASURY ? new PublicKey(TREASURY) : fundManager
  if (!TREASURY) {
    console.warn('TREASURY env not set; defaulting treasury to fund manager for finalize_withdrawal')
  }

  // Enumerate all fund-owned mint ATAs (prefer WSOL first), skipping shares mint
  const parsed = await connection.getParsedTokenAccountsByOwner(fundPda, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') })
  const mintSet = new Map<string, { mint: PublicKey }>()
  for (const a of parsed.value) {
    const info: any = a.account.data
    const mintStr = info.parsed?.info?.mint
    if (!mintStr) continue
    const mintPk = new PublicKey(mintStr)
    if (mintPk.equals(sharesMint)) continue // skip shares mint
    mintSet.set(mintStr, { mint: mintPk })
  }
  // Build list and sort with WSOL first
  const mints: PublicKey[] = Array.from(mintSet.values()).map(v => v.mint)
  mints.sort((a, b) => (a.equals(SOL) ? -1 : b.equals(SOL) ? 1 : 0))

  const perMintSigs: Array<{ mint: string; amount: string; sig: string }> = []
  for (const mint of mints) {
    const ata = getAssociatedTokenAddressSync(mint, fundPda, true)
    const bal = await connection.getTokenAccountBalance(ata).catch(() => null)
    const have = Number(bal?.value?.amount ?? '0')
    if (have === 0) continue
    const progressPda = await getProgressPda(withdrawalStatePk, mint)
    const progressAcc = await connection.getAccountInfo(progressPda)
    let already = 0
    if (progressAcc?.data) {
      try {
        const acc: any = coder.accounts.decode('WithdrawalMintProgress', progressAcc.data)
        already = Number(acc.amount_liquidated ?? acc.amountLiquidated ?? 0)
      } catch {}
    }
    const allowed = Math.floor((have * fraction_bps) / 1_000_000) - already
    if (allowed <= 0) continue

    // Skip dust by USDC value: default to >= $0.50 (500_000 base units for USDC with 6 decimals)
    const usdcOut = await quoteToUsdc(mint, allowed)
    const minUsdBaseUnits = Number(process.env.MIN_USDC_DUST_BASE_UNITS || '0')
    if (usdcOut < minUsdBaseUnits) {
      console.log(`Skipping dust by value for mint ${mint.toBase58()}: ~${(usdcOut / 1e6).toFixed(6)} USDC < ${(minUsdBaseUnits / 1e6).toFixed(6)} USDC`)
      continue
    }

    try {
      const jup = await jupSwapIxs(mint, SOL, allowed)
      if (!jup) {
        console.log('No-op liquidation for mint (likely SOL):', mint.toBase58())
        continue
      }
      let sig: string | null = null
      try {
        sig = await callWithdrawSwapInstruction(withdrawalStatePk, mint, allowed, jup)
      } catch (e: any) {
        const msg = String(e?.message || e)
        // Retry path with stricter route to shrink instruction size
        if (/(encoding overruns|Transaction too large|account keys)/i.test(msg)) {
          console.warn('Retrying with direct-only route for mint:', mint.toBase58())
          const jup2 = await jupSwapIxs(mint, SOL, allowed, { onlyDirectRoutes: true })
          sig = await callWithdrawSwapInstruction(withdrawalStatePk, mint, allowed, jup2)
        } else if (/from must not carry data/i.test(msg)) {
          // PDA-incompatible SystemProgram.transfer inside route (e.g., Simple/pump.fun). Final retry excluding Simple.
          console.warn('Retrying excluding Simple (pump.fun) for mint:', mint.toBase58())
          const jup3 = await jupSwapIxs(mint, SOL, allowed, { excludeDexes: 'Simple' })
          sig = await callWithdrawSwapInstruction(withdrawalStatePk, mint, allowed, jup3)
        } else {
          throw e
        }
      }
      if (sig) perMintSigs.push({ mint: mint.toBase58(), amount: String(allowed), sig })
    } catch (e) {
      console.warn('Liquidation skipped for mint due to route error:', mint.toBase58(), (e as any)?.message || e)
      continue
    }
  }

  // Optional unwrap: close Fund WSOL ATA so lamports are available for finalize
  try {
    const { TransactionInstruction } = require('@solana/web3.js')
    const unwrapData = (coder as any).instruction.encode('unwrap_wsol_fund', {})
    const wsolAta = getAssociatedTokenAddressSync(SOL, fundPda, true)
    const keys = [
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: wsolAta, isWritable: true, isSigner: false },
      { pubkey: fundPda, isWritable: true, isSigner: false }, // destination = Fund PDA system account
      { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    ]
    const unwrapIx = new TransactionInstruction({ programId, keys, data: unwrapData })
    const bh0 = await connection.getLatestBlockhash()
  const addPriorityFee0 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
  const modifyComputeUnits0 = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, UNWRAP_COMPUTE_UNITS) })
    const msg0 = new TransactionMessage({ payerKey: investor, recentBlockhash: bh0.blockhash, instructions: [addPriorityFee0, modifyComputeUnits0, unwrapIx] }).compileToV0Message()
    const tx0 = new VersionedTransaction(msg0)
    tx0.sign([investorKeypair])
    const { execTx } = await import('./helper')
    await execTx(tx0, { blockhash: bh0.blockhash, lastValidBlockHeight: bh0.lastValidBlockHeight })
  } catch (e) {
    console.warn('unwrap WSOL skipped or failed (continuing):', (e as any)?.message || e)
  }

  // Finalize withdrawal: burn shares and pay SOL/fees (skip if k==0)
  const positionSeeds = [Buffer.from('position'), investor.toBuffer(), fundPda.toBuffer()]
  const [investorPositionPk] = await PublicKey.findProgramAddress(positionSeeds, programId)
  const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investor, true)

  const { TransactionInstruction } = require('@solana/web3.js')
  const finalizeData = (coder as any).instruction.encode('finalize_withdrawal', {})
  const finKeys = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: investorPositionPk, isWritable: true, isSigner: false },
    { pubkey: sharesMint, isWritable: true, isSigner: false },
    { pubkey: investorSharesAta, isWritable: true, isSigner: false },
    { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
    { pubkey: investor, isWritable: true, isSigner: true },
    { pubkey: fundManager, isWritable: false, isSigner: false }, // trader
    { pubkey: treasuryPk, isWritable: true, isSigner: false },   // treasury
    { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
    { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
  ]
  const finIx = new TransactionInstruction({ programId, keys: finKeys, data: finalizeData })

  const bh = await connection.getLatestBlockhash()
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: Math.max(200_000, FINALIZE_COMPUTE_UNITS) })
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: bh.blockhash, instructions: [addPriorityFee, modifyComputeUnits, finIx] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  // Capture payout before finalize in case the state is closed afterwards
  let payoutLamportsPre: string | null = null
  try {
    const infoPre = await connection.getAccountInfo(withdrawalStatePk)
    if (infoPre?.data) {
      const wsPre: any = coder.accounts.decode('WithdrawalState', infoPre.data)
      payoutLamportsPre = (wsPre.sol_accumulated ?? wsPre.solAccumulated ?? 0).toString()
    }
  } catch {}

  // Check k from on-chain state first; if allowed==0 or liquidated==0, skip finalize to avoid burning 0
  let finalizeSig: string | null = null
  try {
    const info0 = await connection.getAccountInfo(withdrawalStatePk)
    if (info0?.data) {
      const ws0: any = coder.accounts.decode('WithdrawalState', info0.data)
      const allowed0 = BigInt(ws0.input_allowed_total_sum ?? ws0.inputAllowedTotalSum ?? 0)
      const liq0 = BigInt(ws0.input_liquidated_sum ?? ws0.inputLiquidatedSum ?? 0)
      const doFinalize = allowed0 > 0n && liq0 > 0n
      if (doFinalize) {
        finalizeSig = await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })
      } else {
        console.log('Skipping finalize: k == 0 (no liquidation progress).')
      }
    } else {
      console.warn('WithdrawalState not found before finalize; skipping to avoid zero burn.')
    }
  } catch (e) {
    console.warn('Finalize pre-check failed; attempting finalize anyway:', (e as any)?.message || e)
    finalizeSig = await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })
  }

  // Attempt to fetch updated WithdrawalState to compute k and payout
  let kApplied: number | null = null
  let payoutLamports: string | null = null
  try {
    const info = await connection.getAccountInfo(withdrawalStatePk)
    if (info?.data) {
      const ws: any = coder.accounts.decode('WithdrawalState', info.data)
      const allowed = BigInt(ws.input_allowed_total_sum ?? ws.inputAllowedTotalSum ?? 0)
      const liq = BigInt(ws.input_liquidated_sum ?? ws.inputLiquidatedSum ?? 0)
      kApplied = allowed === 0n ? 1 : Number(liq * 1_000_000n / allowed) / 1_000_000
      payoutLamports = (ws.sol_accumulated ?? ws.solAccumulated ?? 0).toString()
    } else if (payoutLamportsPre) {
      payoutLamports = payoutLamportsPre
    }
  } catch {}

  // Final safety: derive investor lamports delta from finalize tx if still missing/zero
  try {
    if ((!payoutLamports || payoutLamports === '0') && finalizeSig) {
      const txInfo = await connection.getTransaction(finalizeSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' as any })
      const meta: any = txInfo?.meta
      const pre = meta?.preBalances
      const post = meta?.postBalances
      const keys: string[] = (txInfo?.transaction?.message as any)?.staticAccountKeys?.map((k: any) => k.toBase58?.() || String(k)) || []
      const idx = keys.findIndex(k => k === investor.toBase58())
      if (idx >= 0 && pre && post) {
        const delta = BigInt(post[idx]) - BigInt(pre[idx])
        if (delta > 0n) payoutLamports = delta.toString()
      }
    }
  } catch {}

  // Persist directly to MongoDB (preferred when backend is not running)
  try {
    if (finalizeSig) {
      const uri = process.env.MONGODB_URI
      if (!uri) throw new Error('MONGODB_URI not set')
      const client = new MongoClient(uri)
      await client.connect()
      const db = client.db('Defunds')
      const col = db.collection<any>('invWithdraw')
      const fundId = fundPda.toBase58()
      const amountSol = payoutLamports ? Number(payoutLamports) / 1e9 : 0
      const entry: any = {
        amountSol,
        signature: finalizeSig,
        timestamp: new Date().toISOString(),
        details: {
          perMintSwapSigs: perMintSigs.map(s => s.sig),
          ...(kApplied != null ? { kApplied } : {}),
        },
      }
      const pathKey = `funds.${fundId}`
      const updateDoc: any = {
        $setOnInsert: { _id: investor.toBase58() },
        $push: { [pathKey]: entry },
        $set: { updatedAt: new Date() },
      }
      await col.updateOne({ _id: investor.toBase58() } as any, updateDoc, { upsert: true })
      await client.close()
      console.log('Direct Mongo record upserted for', fundId)
    } else {
      console.log('Finalize not executed; skipping Mongo persist (will keep local outbox)')
    }
  } catch (e) {
    console.warn('Failed to persist withdraw record (Mongo) (will write locally):', (e as any)?.message || e)
    try {
      const outDir = path.resolve(__dirname, '../../.out')
      fs.mkdirSync(outDir, { recursive: true })
      const file = path.join(outDir, `withdraw-${Date.now()}.json`)
      const record = {
        investor: investor.toBase58(),
        fundId: fundPda.toBase58(),
        payoutLamports,
        finalizeSig,
        swaps: perMintSigs,
        kApplied,
        at: new Date().toISOString(),
      }
      fs.writeFileSync(file, JSON.stringify(record, null, 2))
      console.log('Saved local withdraw record to', file)
    } catch (e2) {
      console.warn('Also failed to write local record:', (e2 as any)?.message || e2)
    }
  }

  console.log('Investor withdrawal completed. finalizeSig=', finalizeSig)
})()
