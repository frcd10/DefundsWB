import 'dotenv/config'
import fetch from 'node-fetch'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token'
import { SystemProgram, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js'
import { fundPda, wallet, jupiterProgramId as JUPITER_PROGRAM, connection, getAdressLookupTableAccounts, instructionDataToTransactionInstruction, execTx, idl, programId } from './helper'

(async () => {
  const anchor = require('@coral-xyz/anchor') as any
  const coder = new anchor.BorshCoder(idl)

  // Mints
  const SOL = new PublicKey('So11111111111111111111111111111111111111112')
  const USDC = new PublicKey('2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv')
  const LITE_API = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

  // ATAs for fund
  const usdcAta = getAssociatedTokenAddressSync(USDC, fundPda, true)
  const wsolAta = getAssociatedTokenAddressSync(SOL, fundPda, true)

  // Ensure ATAs exist
  const setupIxs: any[] = []
  const usdcInfo = await connection.getAccountInfo(usdcAta)
  if (!usdcInfo) setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, usdcAta, fundPda, USDC))
  const wsolInfo = await connection.getAccountInfo(wsolAta)
  if (!wsolInfo) setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, wsolAta, fundPda, SOL))

  // Determine amount to sell as percentage of current USDC
  const pctRaw = process.env.SELL_PERCENT || '50' // 50%
  const pct = Math.max(0, Math.min(100, Number(pctRaw)))
  const usdcBal = await connection.getTokenAccountBalance(usdcAta).catch(() => null)
  const have = Number(usdcBal?.value?.amount ?? '0')
  if (have === 0) {
    console.error('Fund USDC ATA has zero balance; nothing to sell.')
    process.exit(1)
  }
  const amountIn = Math.floor((have * pct) / 100)
  if (amountIn <= 0) {
    console.error('Computed amountIn is zero; adjust SELL_PERCENT.')
    process.exit(1)
  }

  // Quote USDC -> SOL
  const quoteUrl = new URL('/swap/v1/quote', LITE_API)
  quoteUrl.searchParams.set('inputMint', USDC.toBase58())
  quoteUrl.searchParams.set('outputMint', SOL.toBase58())
  quoteUrl.searchParams.set('amount', String(amountIn))
  quoteUrl.searchParams.set('slippageBps', String(process.env.SLIPPAGE_BPS || '100'))
  quoteUrl.searchParams.set('onlyDirectRoutes', 'true')
  const quote = await fetch(quoteUrl.toString()).then((r) => r.json())
  if (!quote || !quote.routePlan?.length) throw new Error('No route from lite-api')

  // Build swap-instructions
  const swapReqBody: any = {
    quoteResponse: quote,
    userPublicKey: fundPda.toBase58(),
    payer: wallet.publicKey.toBase58(),
    userSourceTokenAccount: usdcAta.toBase58(),
    userDestinationTokenAccount: wsolAta.toBase58(),
    wrapAndUnwrapSol: false,
    prioritizationFeeLamports: 'auto',
    useTokenLedger: false,
    useSharedAccounts: false,
    skipUserAccountsRpcCalls: true,
    skipAtaCreation: true,
  }
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
  if (swapIxs.error) throw new Error('Failed to get swap instructions: ' + swapIxs.error)
  const { swapInstruction: routerIx, tokenLedgerInstruction: ledgerIx, setupInstructions = [], cleanupInstruction, addressLookupTableAddresses = [] } = swapIxs

  const swapInstruction = instructionDataToTransactionInstruction(routerIx)
  const ledgerInstruction = instructionDataToTransactionInstruction(ledgerIx)

  // Clear fund signer on outer ix
  const userKeyMeta = swapInstruction!.keys.find((k) => k.pubkey.toBase58() === fundPda.toBase58())
  if (userKeyMeta) userKeyMeta.isSigner = false

  // Encode for CPI
  const routerData = Buffer.from(routerIx.data, 'base64')
  const toProgramIx = (innerIx: any, innerData: Buffer) => {
    const keys = [
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: JUPITER_PROGRAM, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      ...innerIx.keys,
    ]
    const data = coder.instruction.encode('token_swap_vault', { data: innerData, tmp: Buffer.from('defunds') })
    return new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })
  }

  // Pre-ixs: ensure ATAs exist, set CU budget
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Number(process.env.PRIORITY_FEE_MICROLAMPORTS || '5000') })

  const addressLookupTableAccounts = await getAdressLookupTableAccounts(addressLookupTableAddresses)
  const blockhash = await connection.getLatestBlockhash()

  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: [
      ...setupIxs,
      addPriorityFee,
      modifyComputeUnits,
      ...(ledgerIx ? [instructionDataToTransactionInstruction(ledgerIx)!] : []),
      toProgramIx(swapInstruction!, routerData),
      ...(cleanupInstruction ? [instructionDataToTransactionInstruction(cleanupInstruction)!] : []),
    ],
  }).compileToV0Message(addressLookupTableAccounts)

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet.payer])
  await execTx(tx, { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight })

  // Optional: log how much we attempted to sell in UI units
  console.log(`Attempted to sell ${amountIn} base units of USDC (~${amountIn / 10 ** (usdcBal?.value?.decimals ?? 6)} USDC) => WSOL`)
})()
