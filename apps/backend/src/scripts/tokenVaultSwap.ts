import 'dotenv/config'
import fetch from 'node-fetch'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token'
import {
  SystemProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  fundPda,
  provider,
  wallet,
  jupiterProgramId as JUPITER_PROGRAM,
  connection,
  getAdressLookupTableAccounts,
  instructionDataToTransactionInstruction,
  execTx,
  idl,
  programId,
} from './helper'
import { createJupiterApiClient, SwapInstructionsPostRequest } from '@jup-ag/api'

// Mints (defaults can be overridden via env)
const SOL = new PublicKey('So11111111111111111111111111111111111111112') // WSOL mint
const DEFAULT_USDC = new PublicKey('2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv')
const INPUT_MINT = new PublicKey(process.env.INPUT_MINT || SOL.toBase58())
const OUTPUT_MINT = new PublicKey(process.env.OUTPUT_MINT || DEFAULT_USDC.toBase58())

// Optional existing source token account (owned by fund) to pull tokens from for top-up
const FUND_EXISTING_SOURCE_TA = process.env.VAULT_SOURCE_TA ? new PublicKey(process.env.VAULT_SOURCE_TA) : null

// Env
const LITE_API = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

;(async () => {
  const anchor = require('@coral-xyz/anchor') as any
  const coder = new anchor.BorshCoder(idl)

  // Params
  const inLamports = Number(process.env.INPUT_AMOUNT || '100000') // default 0.0001 in base units

  // Derive ATAs for fund
  const sourceAta = getAssociatedTokenAddressSync(INPUT_MINT, fundPda, true)
  const destAta = getAssociatedTokenAddressSync(OUTPUT_MINT, fundPda, true)

  // Ensure destination ATA exists (create if missing)
  const setupIxs: any[] = []
  const destInfo = await connection.getAccountInfo(destAta)
  if (!destInfo) {
    setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, destAta, fundPda, OUTPUT_MINT))
  }

  // Ensure source ATA exists (create if missing)
  const sourceInfo = await connection.getAccountInfo(sourceAta)
  if (!sourceInfo) {
    setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, sourceAta, fundPda, INPUT_MINT))
  }

  // WSOL special handling: if INPUT_MINT is SOL and balance < amount, top up by
  // 1) transferring from FUND_EXISTING_SOURCE_TA via program pda_token_transfer (if provided), else
  // 2) wrap SOL by system transfer to ATA and spl-token sync native
  const ensureSourceBalance = async () => {
    try {
      const bal = await connection.getTokenAccountBalance(sourceAta).catch(() => null)
      const have = Number(bal?.value?.amount ?? '0')
      if (have >= inLamports) return
      const need = inLamports - have
      if (INPUT_MINT.equals(SOL)) {
        if (FUND_EXISTING_SOURCE_TA) {
          const data = coder.instruction.encode('pda_token_transfer', { amount: new anchor.BN(need) })
          const keys = [
            { pubkey: fundPda, isWritable: true, isSigner: false },
            { pubkey: FUND_EXISTING_SOURCE_TA, isWritable: true, isSigner: false },
            { pubkey: sourceAta, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
          ]
          const progIx = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })
          setupIxs.push(progIx)
        } else {
          // Wrap SOL held by payer into fund-owned WSOL ATA
          setupIxs.push(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: sourceAta, lamports: need }))
          setupIxs.push(createSyncNativeInstruction(sourceAta))
        }
      } else {
        // Non-native input; try to pull from existing source TA if provided
        if (FUND_EXISTING_SOURCE_TA) {
          const data = coder.instruction.encode('pda_token_transfer', { amount: new anchor.BN(need) })
          const keys = [
            { pubkey: fundPda, isWritable: true, isSigner: false },
            { pubkey: FUND_EXISTING_SOURCE_TA, isWritable: true, isSigner: false },
            { pubkey: sourceAta, isWritable: true, isSigner: false },
            { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
          ]
          const progIx = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })
          setupIxs.push(progIx)
        } else {
          throw new Error('Insufficient source token balance and no VAULT_SOURCE_TA provided for top-up')
        }
      }
    } catch (e) {
      throw e
    }
  }

  await ensureSourceBalance()

  // Quote using lite API (v1)
  const quoteUrl = new URL('/swap/v1/quote', LITE_API)
  quoteUrl.searchParams.set('inputMint', INPUT_MINT.toBase58())
  quoteUrl.searchParams.set('outputMint', OUTPUT_MINT.toBase58())
  quoteUrl.searchParams.set('amount', String(inLamports))
  quoteUrl.searchParams.set('slippageBps', String(100)) // 1%
  quoteUrl.searchParams.set('onlyDirectRoutes', 'true')
  const quote = await fetch(quoteUrl.toString()).then(r => r.json())
  if (!quote || !quote.routePlan?.length) throw new Error('No route from lite-api')

  console.log('Using source ATA:', sourceAta.toBase58())

  // Swap-instructions using lite-api shared route; force source and destination accounts
  const swapReqBody: any = {
    quoteResponse: quote as any,
    // IMPORTANT: userPublicKey must be the owner of the token accounts (the Fund PDA 99c9...),
    // NOT the program id. The PDA is the signer inside CPI via invoke_signed.
    userPublicKey: fundPda.toBase58(),
    payer: wallet.publicKey.toBase58(),
    userSourceTokenAccount: sourceAta.toBase58(),
    userDestinationTokenAccount: destAta.toBase58(),
    wrapAndUnwrapSol: false,
    prioritizationFeeLamports: 'auto',
  }
  // Use classic Route (no ledger) now that source is the canonical ATA
  swapReqBody.useTokenLedger = false
  // In CPI mode, we already control accounts: disable shared accounts and skip user account RPC checks
  swapReqBody.useSharedAccounts = false
  swapReqBody.skipUserAccountsRpcCalls = true
  // Avoid ambiguous legacy field hints; we create ATAs ourselves
  swapReqBody.skipAtaCreation = true
  const swapResp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(swapReqBody),
  })
  if (!swapResp.ok) {
    const txt = await swapResp.text()
    console.error('swap-instructions error', swapResp.status, txt)
    process.exit(1)
  }
  const swapIxs = await swapResp.json()
  if (swapIxs.error) {
    throw new Error('Failed to get swap instructions: ' + swapIxs.error)
  }
  const {
    computeBudgetInstructions = [],
    setupInstructions = [],
    swapInstruction: routerIx,
  tokenLedgerInstruction: ledgerIx, // will be undefined when useTokenLedger=false
    cleanupInstruction,
    addressLookupTableAddresses = [],
  } = swapIxs
  // Build remaining accounts per Jupiter instruction and mark user as non-signer in outer ix
  const swapInstruction = instructionDataToTransactionInstruction(routerIx)
  const ledgerInstruction = instructionDataToTransactionInstruction(ledgerIx)
  // Debug: verify router accounts include our specified source/destination TAs
  const routerAccs = routerIx.accounts.map((a: any) => a.pubkey)
  const hasSource = routerAccs.includes(sourceAta.toBase58())
  const hasDest = routerAccs.includes(destAta.toBase58())
  console.log('Router includes source TA?', hasSource, 'dest ATA?', hasDest)
  const userKeyMeta = swapInstruction!.keys.find((k) => k.pubkey.toBase58() === fundPda.toBase58())
  if (userKeyMeta) userKeyMeta.isSigner = false
  // No ledger path in this run

  // Encode our program instruction data and account metas
  const routerData = Buffer.from(routerIx.data, 'base64')
  const ledgerData = ledgerIx ? Buffer.from(ledgerIx.data, 'base64') : null
  console.log('Fund PDA:', fundPda.toBase58())
  const signerMetas = routerIx.accounts.filter((a: any) => a.isSigner)
  console.log('Router signers:', signerMetas.map((a: any) => a.pubkey))
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })

  // Build our CPI-forwarding instructions: ledger first (if present), then route-with-ledger
  const toProgramIx = (innerIx: any, innerData: Buffer) => {
    const keys = [
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ...innerIx.keys,
    ]
    const data = coder.instruction.encode('token_swap_vault', {
      data: innerData,
      tmp: Buffer.from('defunds'),
    })
    return new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })
  }
  const instructionLedger = null
  const instructionRoute = toProgramIx(swapInstruction!, routerData)

  const addressLookupTableAccounts = await getAdressLookupTableAccounts(addressLookupTableAddresses)
  const blockhash = await connection.getLatestBlockhash()
  const includeSetup = setupIxs.length > 0
  const preBudgetIxs = [
    addPriorityFee,
    modifyComputeUnits,
    ...(includeSetup
      ? setupInstructions.map(instructionDataToTransactionInstruction).filter(Boolean)
      : []),
  ]
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [
      ...setupIxs,
      ...preBudgetIxs,
  ...(instructionLedger ? [instructionLedger] : []),
      instructionRoute,
      ...(includeSetup && cleanupInstruction ? [instructionDataToTransactionInstruction(cleanupInstruction)!] : []),
    ],
  }).compileToV0Message(addressLookupTableAccounts)
  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet.payer])

  await execTx(tx, { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight })
})()
