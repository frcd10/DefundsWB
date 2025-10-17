import { Router } from 'express'
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, AddressLookupTableAccount } from '@solana/web3.js'
import fs from 'fs'
import path from 'path'
import { solanaService } from '../services/solana'

const router = Router()

const JUPITER_PROGRAM = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')
const LITE_API = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

// Lazily resolve the on-chain program ID. Prefer env SOLANA_PROGRAM_ID, fallback to IDL address.
let CACHED_PROGRAM_ID: PublicKey | null = null
function getProgramId(): PublicKey {
  if (CACHED_PROGRAM_ID) return CACHED_PROGRAM_ID
  const fromEnv = process.env.SOLANA_PROGRAM_ID
  let addr = fromEnv
  if (!addr) {
    try {
      const idl = getIdl()
      if (idl?.address) addr = idl.address
    } catch (e) {
      // ignore, will throw below if still missing
    }
  }
  if (!addr) {
    throw new Error('SOLANA_PROGRAM_ID not set and IDL address unavailable')
  }
  CACHED_PROGRAM_ID = new PublicKey(addr)
  return CACHED_PROGRAM_ID
}

function getIdl() {
  const repoRoot = path.resolve(__dirname, '../../../..')
  const idlPath = path.join(repoRoot, 'target', 'idl', 'managed_funds.json')
  return JSON.parse(fs.readFileSync(idlPath, 'utf-8'))
}

function instructionDataToTransactionInstruction(instructionPayload: any) {
  if (!instructionPayload) return null
  return new (require('@solana/web3.js').TransactionInstruction)({
    programId: new PublicKey(instructionPayload.programId),
    keys: instructionPayload.accounts.map((k: any) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(instructionPayload.data, 'base64'),
  })
}

router.post('/vault/prepare', async (req, res) => {
  try {
    const { amountLamports, inputMint, outputMint, fundPda, payer, slippagePercent } = req.body as any
    if (!amountLamports || amountLamports <= 0) return res.status(400).json({ error: 'amountLamports required' })
    if (!inputMint || !outputMint) return res.status(400).json({ error: 'inputMint and outputMint required' })
    if (!fundPda) return res.status(400).json({ error: 'fundPda required' })
    if (!payer) return res.status(400).json({ error: 'payer required (client wallet pubkey)' })
    const slippagePct = Number.isFinite(slippagePercent) ? Number(slippagePercent) : 1
    if (slippagePct < 0 || slippagePct > 50) return res.status(400).json({ error: 'slippagePercent must be between 0 and 50' })
    const slippageBps = Math.round(slippagePct * 100) // convert percent to bps (e.g., 1 -> 100)

  const connection = solanaService.getConnection()
    const idl = getIdl()
    const coder = new (require('@coral-xyz/anchor').BorshCoder)(idl)
    const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } = require('@solana/spl-token')
  const IN_MINT = new PublicKey(inputMint)
  const OUT_MINT = new PublicKey(outputMint)
  const FUND = new PublicKey(fundPda)
    const PROGRAM_ID = getProgramId()

    // Source/dest token accounts (use Fund PDA WSOL ATA and USDC ATA)
    const sourceAta = getAssociatedTokenAddressSync(IN_MINT, FUND, true)
    const destAta = getAssociatedTokenAddressSync(OUT_MINT, FUND, true)
    const payerKey = new PublicKey(payer)
    const isSolInput = IN_MINT.equals(WSOL_MINT)
    const [sourceInfo, destInfo] = await Promise.all([
      connection.getAccountInfo(sourceAta),
      connection.getAccountInfo(destAta),
    ])
  const setupIxs: any[] = []
    // For SOL input, do NOT create the Fund's WSOL source ATA; Jupiter will wrap/unwrap Sol under manager user
    if (!isSolInput) {
      if (!sourceInfo) {
        setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, sourceAta, FUND, IN_MINT))
      }
    }
    if (!destInfo) {
      setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, destAta, FUND, OUT_MINT))
    }

    // If selling SPL -> SOL (WSOL), use robust delegate fallback: approve manager, move to manager ATA, manager-as-user swap, revoke
  // Determine flow types up-front
  const isSellToSol = !isSolInput && OUT_MINT.equals(WSOL_MINT)

    if (isSellToSol) {
      // Prepare coder and SPL helpers
  const { createTransferInstruction } = require('@solana/spl-token')

      // Ensure ATAs exist for fund (source, dest) and manager (source)
      const fundSourceAta = sourceAta
      const fundDestAta = destAta // WSOL ATA for fund
      const managerSourceAta = getAssociatedTokenAddressSync(IN_MINT, payerKey, false)

      const [fundSrcInfo, fundDestInfo, mgrSrcInfo] = await Promise.all([
        connection.getAccountInfo(fundSourceAta),
        connection.getAccountInfo(fundDestAta),
        connection.getAccountInfo(managerSourceAta),
      ])
  // Fund ATAs are already handled by the shared pre-check above; only ensure manager source ATA
      if (!mgrSrcInfo) setupIxs.push(createAssociatedTokenAccountInstruction(payerKey, managerSourceAta, payerKey, IN_MINT))

      // Build quote with sensible defaults mirroring script
      const LITE = LITE_API
      const q = new URL('/swap/v1/quote', LITE)
      q.searchParams.set('inputMint', IN_MINT.toBase58())
      q.searchParams.set('outputMint', OUT_MINT.toBase58())
      q.searchParams.set('amount', String(amountLamports))
      q.searchParams.set('slippageBps', String(slippageBps))
      q.searchParams.set('onlyDirectRoutes', 'false')
      const excludeDexes = (process.env.EXCLUDE_DEXES || 'Simple').trim()
      if (excludeDexes) q.searchParams.set('excludeDexes', excludeDexes)
  const quoteSell: any = await fetch(q.toString()).then((r: any) => r.json())
  if (!quoteSell?.routePlan?.length) return res.status(400).json({ error: 'no route for sell' })

      // Request swap-instructions for manager-as-user delivering to Fund WSOL ATA
      const body3: any = {
        quoteResponse: quoteSell,
        userPublicKey: payerKey.toBase58(),
        payer: payerKey.toBase58(),
        userSourceTokenAccount: managerSourceAta.toBase58(),
        destinationTokenAccount: fundDestAta.toBase58(),
        wrapAndUnwrapSol: false,
        prioritizationFeeLamports: 'auto',
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }
      const swapRes3 = await fetch(new URL('/swap/v1/swap-instructions', LITE).toString(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body3)
      })
      if (!swapRes3.ok) {
        const txt = await swapRes3.text()
        return res.status(502).json({ error: 'swap-instructions (sell) failed', details: txt })
      }
  const j3: any = await swapRes3.json()
  const alts3Addrs: string[] = j3.addressLookupTableAddresses || []
      const alts3Infos = alts3Addrs.length ? await connection.getMultipleAccountsInfo(alts3Addrs.map(a => new PublicKey(a))) : []
      const lookupAccounts3: AddressLookupTableAccount[] = alts3Infos.reduce((acc: AddressLookupTableAccount[], info, i) => {
        if (info) acc.push(new AddressLookupTableAccount({ key: new PublicKey(alts3Addrs[i]), state: AddressLookupTableAccount.deserialize(info.data) }))
        return acc
      }, [])

      // Approve manager as delegate on Fund source ATA for amount
      const dataApprove = coder.instruction.encode('pda_token_approve', { amount: new (require('@coral-xyz/anchor')).BN(BigInt(amountLamports)) })
      const keysApprove = [
        { pubkey: FUND, isWritable: true, isSigner: false },
        { pubkey: fundSourceAta, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: payerKey, isWritable: false, isSigner: true },
      ]
      const ixApprove = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys: keysApprove, data: dataApprove })

      // Delegated transfer: move tokens from Fund source ATA to manager's ATA
      const delegatedMoveIx = createTransferInstruction(
        fundSourceAta,
        managerSourceAta,
        payerKey,
        BigInt(amountLamports)
      )

      // Cleanup: revoke delegate
      const dataRevoke = coder.instruction.encode('pda_token_revoke', {})
      const keysRevoke = [
        { pubkey: FUND, isWritable: true, isSigner: false },
        { pubkey: fundSourceAta, isWritable: true, isSigner: false },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: payerKey, isWritable: false, isSigner: true },
      ]
      const ixRevoke = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys: keysRevoke, data: dataRevoke })

      // Compute budget ixs
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

      // Decode Jupiter instructions
  const decodeMany = (arr: any[]): any[] => (arr || []).map(instructionDataToTransactionInstruction).filter(Boolean)
  const jupSetup = decodeMany(j3.setupInstructions || [])
  const jupSwapIx = instructionDataToTransactionInstruction(j3.swapInstruction)
  const cleanupRaw = j3.cleanupInstructions || (j3.cleanupInstruction ? [j3.cleanupInstruction] : [])
  const jupCleanup = decodeMany(cleanupRaw)

      // Build unsigned tx
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const msg = new TransactionMessage({
        payerKey,
        recentBlockhash: blockhash,
        instructions: [
          ...setupIxs,
          ixApprove,
          addPriorityFee,
          modifyComputeUnits,
          delegatedMoveIx,
          ...jupSetup,
          jupSwapIx!,
          ...jupCleanup,
          ixRevoke,
        ],
      }).compileToV0Message(lookupAccounts3)
      const unsignedTx = new VersionedTransaction(msg)
      const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')
      return res.json({ txBase64, addressLookupTableAddresses: alts3Addrs, blockhash, lastValidBlockHeight })
    }

    // 1) Quote
    const quoteUrl = new URL('/swap/v1/quote', LITE_API)
  quoteUrl.searchParams.set('inputMint', IN_MINT.toBase58())
  quoteUrl.searchParams.set('outputMint', OUT_MINT.toBase58())
    quoteUrl.searchParams.set('amount', String(amountLamports))
  quoteUrl.searchParams.set('slippageBps', String(slippageBps))
  quoteUrl.searchParams.set('onlyDirectRoutes', 'false')
    const quoteRes = await fetch(quoteUrl.toString())
    if (!quoteRes.ok) return res.status(502).json({ error: 'quote failed' })
  const quote: any = await quoteRes.json()
  if (!quote?.routePlan?.length) return res.status(400).json({ error: 'no route' })

    // 2) Swap-instructions (non-ledger, explicit accounts)
    // Build swap request based on input mint being SOL vs SPL
    const swapReqBody: any = { quoteResponse: quote, payer, skipUserAccountsRpcCalls: true, useTokenLedger: false, skipAtaCreation: true }
    if (isSolInput) {
      // Manager-as-user path for SOL legs; Jupiter wraps from manager SOL and delivers output to Fund ATA
      swapReqBody.userPublicKey = payer
      swapReqBody.wrapAndUnwrapSol = true
      swapReqBody.useSharedAccounts = false
      swapReqBody.destinationTokenAccount = destAta.toBase58()
    } else {
      // SPL-only CPI path using Fund-owned ATAs
      swapReqBody.userPublicKey = FUND.toBase58()
      swapReqBody.userSourceTokenAccount = sourceAta.toBase58()
      swapReqBody.userDestinationTokenAccount = destAta.toBase58()
      swapReqBody.wrapAndUnwrapSol = false
      swapReqBody.useSharedAccounts = false
    }
    const swapRes = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(swapReqBody),
    })
    if (!swapRes.ok) {
      const txt = await swapRes.text()
      return res.status(502).json({ error: 'swap-instructions failed', details: txt })
    }
  const swapIxs: any = await swapRes.json()
  const routerIx = swapIxs.swapInstruction
  const setupIxsFromJup: any[] = swapIxs.setupInstructions || []
  const cleanupIxsFromJup: any[] = swapIxs.cleanupInstructions || (swapIxs.cleanupInstruction ? [swapIxs.cleanupInstruction] : [])
  const addressLookupTableAddresses: string[] = swapIxs.addressLookupTableAddresses || []

    // 3) Build our CPI-forwarding instruction
  const swapInstruction = instructionDataToTransactionInstruction(routerIx)!
  // For SPL-only path, ensure PDA is the signer inside CPI by rewriting any payer signer to FUND.
  // For SOL input path, keep the manager (payer) as signer so System transfers are valid.
  if (!isSolInput) {
    for (const k of swapInstruction.keys) {
      if (k.isSigner && k.pubkey.toBase58() === payerKey.toBase58()) {
        k.pubkey = FUND
        k.isSigner = true
      }
    }
  }
  // Flip Fund user meta to non-signer in outer ix; program will sign via seeds during CPI
  const userKeyMeta = swapInstruction.keys.find((k: any) => k.pubkey.toBase58() === FUND.toBase58())
  if (userKeyMeta) userKeyMeta.isSigner = false
    const routerData = Buffer.from(routerIx.data, 'base64')
    const data = coder.instruction.encode('token_swap_vault', { data: routerData, tmp: Buffer.from('defunds') })
    // Anchor accounts order for TokenSwapVault: fund (mut), manager (signer), jupiter_program, token_program, system_program
    const keys = [
      { pubkey: FUND, isWritable: true, isSigner: false },
      { pubkey: payerKey, isWritable: false, isSigner: true }, // manager signer
      { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ...swapInstruction.keys,
    ]
  const programIx = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys, data })

    // 4) optional compute ixs
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

    // Decode any setup/cleanup instructions Jupiter returned (client-executed, not CPI)
    const decodeMany = (arr: any[]): any[] => arr
      .map(instructionDataToTransactionInstruction)
      .filter(Boolean)
    const decodedSetup = decodeMany(setupIxsFromJup)
    const decodedCleanup = decodeMany(cleanupIxsFromJup)

    // 5) address lookup tables
    let lookupAccounts: AddressLookupTableAccount[] = []
    if (addressLookupTableAddresses.length) {
      const infos = await connection.getMultipleAccountsInfo(addressLookupTableAddresses.map((a: string) => new PublicKey(a)))
      lookupAccounts = infos.reduce((acc: AddressLookupTableAccount[], info, i) => {
        if (info) {
          acc.push(new AddressLookupTableAccount({ key: new PublicKey(addressLookupTableAddresses[i]), state: AddressLookupTableAccount.deserialize(info.data) }))
        }
        return acc
      }, [])
    }

    // 6) Compile unsigned v0 message using client-specified payer
  // reuse payerKey declared above
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
  instructions: [...setupIxs, ...decodedSetup, addPriorityFee, modifyComputeUnits, programIx, ...decodedCleanup],
    }).compileToV0Message(lookupAccounts)
    const unsignedTx = new VersionedTransaction(messageV0)
    const txBase64 = Buffer.from(unsignedTx.serialize()).toString('base64')

    return res.json({ txBase64, addressLookupTableAddresses, blockhash, lastValidBlockHeight })
  } catch (e: any) {
    console.error('prepare swap failed', e)
    return res.status(500).json({ error: 'internal error', details: e?.message || String(e) })
  }
})

export { router as swapRoutes }
