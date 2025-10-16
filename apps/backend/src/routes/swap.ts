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
  const { getAssociatedTokenAddressSync } = require('@solana/spl-token')
  const IN_MINT = new PublicKey(inputMint)
  const OUT_MINT = new PublicKey(outputMint)
  const FUND = new PublicKey(fundPda)
    const PROGRAM_ID = getProgramId()

    // Source/dest token accounts (use Fund PDA WSOL ATA and USDC ATA)
    const sourceAta = getAssociatedTokenAddressSync(IN_MINT, FUND, true)
    const destAta = getAssociatedTokenAddressSync(OUT_MINT, FUND, true)
    const [sourceInfo, destInfo] = await Promise.all([
      connection.getAccountInfo(sourceAta),
      connection.getAccountInfo(destAta),
    ])
    if (!sourceInfo) return res.status(400).json({ error: 'Fund source ATA missing for inputMint' })
    if (!destInfo) return res.status(400).json({ error: 'Fund USDC ATA missing' })

    // 1) Quote
    const quoteUrl = new URL('/swap/v1/quote', LITE_API)
  quoteUrl.searchParams.set('inputMint', IN_MINT.toBase58())
  quoteUrl.searchParams.set('outputMint', OUT_MINT.toBase58())
    quoteUrl.searchParams.set('amount', String(amountLamports))
  quoteUrl.searchParams.set('slippageBps', String(slippageBps))
    quoteUrl.searchParams.set('onlyDirectRoutes', 'true')
    const quoteRes = await fetch(quoteUrl.toString())
    if (!quoteRes.ok) return res.status(502).json({ error: 'quote failed' })
  const quote: any = await quoteRes.json()
  if (!quote?.routePlan?.length) return res.status(400).json({ error: 'no route' })

    // 2) Swap-instructions (non-ledger, explicit accounts)
    const swapReqBody: any = {
      quoteResponse: quote,
  userPublicKey: FUND.toBase58(),
      userSourceTokenAccount: sourceAta.toBase58(),
      userDestinationTokenAccount: destAta.toBase58(),
  payer: payer, // client wallet pays fees; required above
      wrapAndUnwrapSol: false,
      useSharedAccounts: false,
      skipUserAccountsRpcCalls: true,
      useTokenLedger: false,
      skipAtaCreation: true,
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
  const addressLookupTableAddresses: string[] = swapIxs.addressLookupTableAddresses || []

    // 3) Build our CPI-forwarding instruction
    const swapInstruction = instructionDataToTransactionInstruction(routerIx)!
    // flip user (fund PDA) signer to false in outer ix
    const userKeyMeta = swapInstruction.keys.find((k: any) => k.pubkey.toBase58() === FUND.toBase58())
    if (userKeyMeta) userKeyMeta.isSigner = false
    const routerData = Buffer.from(routerIx.data, 'base64')
    const data = coder.instruction.encode('token_swap_vault', { data: routerData, tmp: Buffer.from('defunds') })
    const keys = [
      { pubkey: FUND, isWritable: true, isSigner: false },
      { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ...swapInstruction.keys,
    ]
  const programIx = new (require('@solana/web3.js').TransactionInstruction)({ programId: PROGRAM_ID, keys, data })

    // 4) optional compute ixs
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })

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
  const payerKey = new PublicKey(payer)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey,
      recentBlockhash: blockhash,
      instructions: [addPriorityFee, modifyComputeUnits, programIx],
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
