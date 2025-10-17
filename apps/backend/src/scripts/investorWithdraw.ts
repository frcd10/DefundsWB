import 'dotenv/config'
import bs58 from 'bs58'
import fetch from 'node-fetch'
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js'
import { AnchorProvider, Wallet, BN, BorshCoder } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import fs from 'fs'
import path from 'path'
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
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: bh.blockhash, instructions: [addPriorityFee, modifyComputeUnits, ix] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })
}

async function jupSwapIxs(inputMint: PublicKey, outputMint: PublicKey, inAmount: number) {
  if (inputMint.equals(outputMint)) {
    return { noop: true }
  }
  // Quote
  const qUrl = new URL('/swap/v1/quote', LITE_API)
  qUrl.searchParams.set('inputMint', inputMint.toBase58())
  qUrl.searchParams.set('outputMint', outputMint.toBase58())
  qUrl.searchParams.set('amount', String(inAmount))
  qUrl.searchParams.set('slippageBps', '2000') // 20% slippage ceiling for safety in volatile routes
  qUrl.searchParams.set('onlyDirectRoutes', 'true')
  const quote = await fetch(qUrl.toString()).then(r => r.json())
  if (!quote || !quote.routePlan?.length) {
    // fallback to allow multi-hop if direct route not available
    const q2 = new URL('/swap/v1/quote', LITE_API)
    q2.searchParams.set('inputMint', inputMint.toBase58())
    q2.searchParams.set('outputMint', outputMint.toBase58())
    q2.searchParams.set('amount', String(inAmount))
    q2.searchParams.set('slippageBps', '2000')
    q2.searchParams.set('onlyDirectRoutes', 'false')
    const quote2 = await fetch(q2.toString()).then(r => r.json())
    if (!quote2 || !quote2.routePlan?.length) throw new Error('No Jupiter route')
    return await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote2,
        userPublicKey: fundPda.toBase58(),
        payer: investorWallet.publicKey.toBase58(),
        userSourceTokenAccount: getAssociatedTokenAddressSync(inputMint, fundPda, true).toBase58(),
        userDestinationTokenAccount: getAssociatedTokenAddressSync(outputMint, fundPda, true).toBase58(),
        wrapAndUnwrapSol: true,
        useTokenLedger: true,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }),
    }).then(r => r.json())
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
    wrapAndUnwrapSol: true,
    useTokenLedger: true,
    useSharedAccounts: false,
    skipUserAccountsRpcCalls: true,
    skipAtaCreation: true,
  }
  const resp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(await resp.text())
  const data = await resp.json()
  return data
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

async function callWithdrawSwapRouter(withdrawalStatePk: PublicKey, inputMint: PublicKey, inAmount: number, jup: any) {
  if ((jup as any).noop) return null
  const ledgerIx = (jup as any).tokenLedgerInstruction
  const routeIx = jup.swapInstruction
  const addressLookupTableAddresses = jup.addressLookupTableAddresses || []

  const toIx = async (inner: any, routerData: Buffer, isLedger: boolean) => {
    const { TransactionInstruction, PublicKey } = require('@solana/web3.js')
    const keys: any[] = [
      { pubkey: withdrawalStatePk, isWritable: true, isSigner: false },
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: investorWallet.publicKey, isWritable: true, isSigner: true },
  { pubkey: new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'), isWritable: false, isSigner: false },
  { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isWritable: false, isSigner: false },
  { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      { pubkey: getAssociatedTokenAddressSync(inputMint, fundPda, true), isWritable: true, isSigner: false },
      { pubkey: inputMint, isWritable: false, isSigner: false },
      { pubkey: await getProgressPda(withdrawalStatePk, inputMint), isWritable: true, isSigner: false },
    ]
    // Append Jupiter router accounts as remaining_accounts
    const routerAccounts = inner.accounts.map((a: any) => ({ pubkey: new PublicKey(a.pubkey), isWritable: !!a.isWritable, isSigner: false }))
    keys.push(...routerAccounts)
    const data = (coder as any).instruction.encode('withdraw_swap_router', {
      in_amount: new BN(inAmount),
      min_out_amount: new BN(0),
      router_data: routerData,
      is_ledger: isLedger,
    })
      return new TransactionInstruction({ programId, keys, data })
  }

  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })

  const addressLookupTableAccounts = await (await import('./helper')).getAdressLookupTableAccounts(addressLookupTableAddresses)
  const blockhash = await connection.getLatestBlockhash()

  const ixs = [] as any[]
  // Setup ATAs if Jupiter included any setup instruction
  if (jup.setupInstructions?.length) {
    const { instructionDataToTransactionInstruction } = await import('./helper')
    ixs.push(...jup.setupInstructions.map(instructionDataToTransactionInstruction).filter(Boolean))
  }
  ixs.push(addPriorityFee, modifyComputeUnits)

  if (ledgerIx) {
    const ledgerData = Buffer.from(ledgerIx.data, 'base64')
    ixs.push(await toIx(ledgerIx, ledgerData, true))
  }
  const routeData = Buffer.from(routeIx.data, 'base64')
  ixs.push(await toIx(routeIx, routeData, false))
  if (jup.cleanupInstruction) {
    const { instructionDataToTransactionInstruction } = await import('./helper')
    ixs.push((instructionDataToTransactionInstruction as any)(jup.cleanupInstruction))
  }

  const msg = new TransactionMessage({ payerKey: investorWallet.publicKey, recentBlockhash: blockhash.blockhash, instructions: ixs }).compileToV0Message(addressLookupTableAccounts)
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

    // Skip dust by USDC value: require >= $0.50 (500_000 base units for USDC with 6 decimals)
    const usdcOut = await quoteToUsdc(mint, allowed)
    const minUsdCents = Number(process.env.MIN_USDC_DUST_BASE_UNITS || '0')
    if (usdcOut < minUsdCents) {
      console.log(`Skipping dust by value for mint ${mint.toBase58()}: ~${usdcOut / 1e6} USDC < ${minUsdCents / 1e6} USDC`)
      continue
    }

    try {
      const jup = await jupSwapIxs(mint, SOL, allowed)
      if (!jup) {
        console.log('No-op liquidation for mint (likely SOL):', mint.toBase58())
        continue
      }
      const sig = await callWithdrawSwapRouter(withdrawalStatePk, mint, allowed, jup)
      if (sig) perMintSigs.push({ mint: mint.toBase58(), amount: String(allowed), sig })
    } catch (e) {
      console.warn('Liquidation skipped for mint due to route error:', mint.toBase58(), (e as any)?.message || e)
      continue
    }
  }

  // Finalize withdrawal: burn shares and pay SOL/fees
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
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: bh.blockhash, instructions: [addPriorityFee, modifyComputeUnits, finIx] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  const finalizeSig = await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })

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
    }
  } catch {}

  // Persist to backend
  try {
    const base = process.env.BACKEND_URL || 'http://localhost:3001'
    await fetch(`${base}/api/withdraw/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investor: investor.toBase58(),
        fundId: fundPda.toBase58(),
        amountSolLamports: payoutLamports,
        finalizeSig,
        swaps: perMintSigs,
        kApplied,
        at: new Date().toISOString(),
      }),
    }).then(r => r.ok ? r.json() : r.text().then(t => Promise.reject(new Error(t))))
  } catch (e) {
    console.warn('Failed to persist withdraw record:', (e as any)?.message || e)
  }

  console.log('Investor withdrawal completed and finalized.', finalizeSig)
})()
