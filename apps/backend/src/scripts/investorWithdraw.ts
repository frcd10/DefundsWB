import 'dotenv/config'
import bs58 from 'bs58'
import fetch from 'node-fetch'
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js'
import { AnchorProvider, Wallet, BN } from '@coral-xyz/anchor'
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
const anchor: any = require('@coral-xyz/anchor')
const program = new anchor.Program(idl as any, programId, provider)

const SOL = new PublicKey('So11111111111111111111111111111111111111112')
const USDC = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

async function getFractionBps(withdrawalStatePk: PublicKey) {
  const ws = await program.account.withdrawalState.fetch(withdrawalStatePk)
  return { fraction_bps: Number(ws.fractionBps), total_shares_snapshot: Number(ws.totalSharesSnapshot) }
}

async function getProgressPda(withdrawalStatePk: PublicKey, mint: PublicKey) {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('withdrawal_mint'), withdrawalStatePk.toBuffer(), mint.toBuffer()],
    program.programId,
  )
  return pda
}

async function getWithdrawalStatePk(investor: PublicKey) {
  const [pda] = await PublicKey.findProgramAddress(
    [Buffer.from('withdrawal'), fundPda.toBuffer(), investor.toBuffer()],
    program.programId,
  )
  return pda
}

async function jupSwapIxs(inputMint: PublicKey, outputMint: PublicKey, inAmount: number) {
  // Quote
  const qUrl = new URL('/swap/v1/quote', LITE_API)
  qUrl.searchParams.set('inputMint', inputMint.toBase58())
  qUrl.searchParams.set('outputMint', outputMint.toBase58())
  qUrl.searchParams.set('amount', String(inAmount))
  qUrl.searchParams.set('slippageBps', '2000') // 20% slippage ceiling for safety in volatile routes
  qUrl.searchParams.set('onlyDirectRoutes', 'true')
  const quote = await fetch(qUrl.toString()).then(r => r.json())
  if (!quote || !quote.routePlan?.length) throw new Error('No Jupiter route')

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
  const ledgerIx = jup.tokenLedgerInstruction
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
    const data = (program.coder as any).instruction.encode('withdraw_swap_router', {
      in_amount: new BN(inAmount),
      min_out_amount: new BN(0),
      router_data: routerData,
      is_ledger: isLedger,
    })
    return new TransactionInstruction({ programId: program.programId, keys, data })
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
  await execTx(tx, { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight })
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
  const { fraction_bps } = await getFractionBps(withdrawalStatePk)

  // Fetch Fund account to get shares mint and manager
  const fundAcc = await program.account.fund.fetch(fundPda)
  const sharesMint: PublicKey = fundAcc.sharesMint
  const fundManager: PublicKey = fundAcc.manager
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

  for (const mint of mints) {
    const ata = getAssociatedTokenAddressSync(mint, fundPda, true)
    const bal = await connection.getTokenAccountBalance(ata).catch(() => null)
    const have = Number(bal?.value?.amount ?? '0')
    if (have === 0) continue
    const progressPda = await getProgressPda(withdrawalStatePk, mint)
    const progressAcc = await connection.getAccountInfo(progressPda)
    let already = 0
    if (progressAcc) {
      try {
        const acc = await program.account.withdrawalMintProgress.fetch(progressPda)
        already = Number(acc.amountLiquidated ?? 0)
      } catch {}
    }
    const allowed = Math.floor((have * fraction_bps) / 1_000_000) - already
    if (allowed <= 0) continue

    // Skip dust by USDC value: require >= $0.50 (500_000 base units for USDC with 6 decimals)
    const usdcOut = await quoteToUsdc(mint, allowed)
    const minUsdCents = Number(process.env.MIN_USDC_DUST_BASE_UNITS || '500000')
    if (usdcOut < minUsdCents) {
      console.log(`Skipping dust by value for mint ${mint.toBase58()}: ~${usdcOut / 1e6} USDC < ${minUsdCents / 1e6} USDC`)
      continue
    }

    const jup = await jupSwapIxs(mint, SOL, allowed)
    await callWithdrawSwapRouter(withdrawalStatePk, mint, allowed, jup)
  }

  // Finalize withdrawal: burn shares and pay SOL/fees
  const positionSeeds = [Buffer.from('position'), investor.toBuffer(), fundPda.toBuffer()]
  const [investorPositionPk] = await PublicKey.findProgramAddress(positionSeeds, program.programId)
  const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investor, true)

  const { TransactionInstruction } = require('@solana/web3.js')
  const finalizeData = (program.coder as any).instruction.encode('finalize_withdrawal', {})
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
  const finIx = new TransactionInstruction({ programId: program.programId, keys: finKeys, data: finalizeData })

  const bh = await connection.getLatestBlockhash()
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: bh.blockhash, instructions: [addPriorityFee, modifyComputeUnits, finIx] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  await execTx(tx, { blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight })

  console.log('Investor withdrawal completed and finalized.')
})()
