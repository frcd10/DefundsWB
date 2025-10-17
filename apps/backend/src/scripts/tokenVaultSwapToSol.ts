import 'dotenv/config'
import fetch from 'node-fetch'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createSyncNativeInstruction, createTransferInstruction } from '@solana/spl-token'
import { SystemProgram, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from '@solana/web3.js'
import { fundPda, wallet, jupiterProgramId as JUPITER_PROGRAM, connection, getAdressLookupTableAccounts, instructionDataToTransactionInstruction, execTx, idl, programId } from './helper'

(async () => {
  const anchor = require('@coral-xyz/anchor') as any
  const coder = new anchor.BorshCoder(idl)

  // Optional preflight: ensure the current wallet is the fund manager
  if (process.env.SKIP_PREFLIGHT !== 'true') {
    try {
      const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'processed' })
      const program = new anchor.Program(idl as any, programId, provider)
      const fundAcc = await program.account.fund.fetch(fundPda)
      const onChainMgr = fundAcc.manager.toBase58 ? fundAcc.manager.toBase58() : String(fundAcc.manager)
      const localMgr = wallet.publicKey.toBase58()
      if (onChainMgr !== localMgr) {
        console.error('Manager mismatch. On-chain manager =', onChainMgr, 'local wallet =', localMgr)
        process.exit(1)
      }
    } catch (e: any) {
      console.warn('Warning: could not run Anchor preflight check (continuing):', e?.message || e)
      // continue — we build and send instructions manually below
    }
  }

  // Mints
  const SOL = new PublicKey('So11111111111111111111111111111111111111112')
  const INPUT_MINT = new PublicKey(process.env.INPUT_MINT || 'ASzHaWMoFFHdhRLcy4qKV6y36dQFdVFRxYNGrUn8pump')
  const LITE_API = process.env.JUPITER_QUOTE_API || 'https://lite-api.jup.ag/'

  // ATAs for fund (source INPUT_MINT and destination WSOL)
  const sourceAta = getAssociatedTokenAddressSync(INPUT_MINT, fundPda, true)
  const wsolAta = getAssociatedTokenAddressSync(SOL, fundPda, true)

  // Ensure ATAs exist
  const setupIxs: any[] = []
  const sourceInfo = await connection.getAccountInfo(sourceAta)
  if (!sourceInfo) setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, sourceAta, fundPda, INPUT_MINT))
  const wsolInfo = await connection.getAccountInfo(wsolAta)
  if (!wsolInfo) setupIxs.push(createAssociatedTokenAccountInstruction(wallet.publicKey, wsolAta, fundPda, SOL))

  // Determine amount to sell as percentage of current INPUT_MINT
  const pctRaw = process.env.SELL_PERCENT || '100' // 50%
  const pct = Math.max(0, Math.min(100, Number(pctRaw)))
  const srcBal = await connection.getTokenAccountBalance(sourceAta).catch(() => null)
  const have = Number(srcBal?.value?.amount ?? '0')
  if (have === 0) {
    console.error('Fund source ATA has zero balance; nothing to sell.')
    process.exit(1)
  }
  const amountIn = Math.floor((have * pct) / 100)
  if (amountIn <= 0) {
    console.error('Computed amountIn is zero; adjust SELL_PERCENT.')
    process.exit(1)
  }
  // Build quote: INPUT_MINT -> SOL (delivered as WSOL to fund ATA)
  const q = new URL('/swap/v1/quote', LITE_API)
  q.searchParams.set('inputMint', INPUT_MINT.toBase58())
  q.searchParams.set('outputMint', SOL.toBase58())
  q.searchParams.set('amount', String(amountIn))
  q.searchParams.set('slippageBps', String(process.env.SLIPPAGE_BPS || '100'))
  // Allow multi-hop like in tokenVaultSwap.ts; we will exclude problematic AMMs
  q.searchParams.set('onlyDirectRoutes', 'false')
  // Exclude DEXes that require system transfers from `user` (PDA-incompatible). Default: Simple
  const excludeDexes = (process.env.EXCLUDE_DEXES || 'Simple').trim()
  if (excludeDexes.length > 0) q.searchParams.set('excludeDexes', excludeDexes)
  const quote = await fetch(q.toString()).then((r) => r.json())
  if (!quote || !quote.routePlan?.length) throw new Error('No route from lite-api')

  // Fetch swap-instructions with Fund as user and deliver to fund WSOL ATA
  const body: any = {
    quoteResponse: quote,
    userPublicKey: fundPda.toBase58(),
    payer: wallet.publicKey.toBase58(),
    userSourceTokenAccount: sourceAta.toBase58(),
    userDestinationTokenAccount: wsolAta.toBase58(),
    wrapAndUnwrapSol: false,
    // Important: avoid Jupiter adding a lamports transfer (tip/platform fee) from the PDA user
    // which would fail with "Transfer: from must not carry data". We set 0 and control priority via ComputeBudget.
    prioritizationFeeLamports: 0,
    useTokenLedger: false,
    useSharedAccounts: false,
    skipUserAccountsRpcCalls: true,
    skipAtaCreation: true,
  }
  const resp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`swap-instructions error ${resp.status}: ${txt}`)
  }
  const json = await resp.json()
  if (json.error) throw new Error('Failed to get swap instructions: ' + json.error)

  let routerIxData = json.swapInstruction
  let legIx = instructionDataToTransactionInstruction(routerIxData)!
  let legData = Buffer.from(routerIxData.data, 'base64')

  // Ensure fund isn't marked as a signer on the forwarded ix; our outer ix supplies the signer
  const meta = legIx.keys.find((k) => k.pubkey.toBase58() === fundPda.toBase58())
  if (meta) meta.isSigner = false

  // If router accounts exceed CPI limit (64 total, we add 5 fixed), re-quote with stricter constraints
  const MAX_INNER_KEYS = 64 - 5
  if (legIx.keys.length > MAX_INNER_KEYS) {
    console.warn(`Router accounts too many (${legIx.keys.length} > ${MAX_INNER_KEYS}). Re-quoting with direct route and excluding Simple...`)
    const qDirect = new URL('/swap/v1/quote', LITE_API)
    qDirect.searchParams.set('inputMint', INPUT_MINT.toBase58())
    qDirect.searchParams.set('outputMint', SOL.toBase58())
    qDirect.searchParams.set('amount', String(amountIn))
    qDirect.searchParams.set('slippageBps', String(process.env.SLIPPAGE_BPS || '100'))
    qDirect.searchParams.set('onlyDirectRoutes', 'true')
    qDirect.searchParams.set('excludeDexes', 'Simple')
    const quoteDirect = await fetch(qDirect.toString()).then((r) => r.json()).catch(() => null)
  if (quoteDirect?.routePlan?.length) {
      const bodyDirect: any = {
        quoteResponse: quoteDirect,
        userPublicKey: fundPda.toBase58(),
        payer: wallet.publicKey.toBase58(),
        userSourceTokenAccount: sourceAta.toBase58(),
        userDestinationTokenAccount: wsolAta.toBase58(),
        wrapAndUnwrapSol: false,
        prioritizationFeeLamports: 0,
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }
      const respDirect = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyDirect),
      })
      if (respDirect.ok) {
        const jsonDirect = await respDirect.json()
        const routerIxDataD = jsonDirect.swapInstruction
        const legIxD = instructionDataToTransactionInstruction(routerIxDataD)!
        const legDataD = Buffer.from(routerIxDataD.data, 'base64')
        const metaD = legIxD.keys.find((k) => k.pubkey.toBase58() === fundPda.toBase58())
        if (metaD) metaD.isSigner = false
        if (legIxD.keys.length <= MAX_INNER_KEYS) {
          // Replace with smaller instruction entirely
          routerIxData = routerIxDataD
          legIx = legIxD
          legData = legDataD
        } else {
          console.warn(`Direct route still has too many accounts (${legIxD.keys.length}). Proceeding and expecting failure.`)
        }
      } else {
        console.warn('Direct-route swap-instructions fetch failed; continuing with original route')
      }
    } else {
      console.warn('No direct route available after exclusion; continuing with original route')
    }
  }

  const addressLookupTableAddresses = json.addressLookupTableAddresses || []
  const toProgramIx = (innerIx: any, innerData: Buffer) => {
    const keys = [
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: wallet.publicKey, isWritable: false, isSigner: true }, // manager signer
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
      // Jupiter setup (if any)
      ...(((json.setupInstructions as any[]) || []).map(instructionDataToTransactionInstruction).filter(Boolean)),
      // Single-leg route
      toProgramIx(legIx, legData),
      // Cleanup (if any)
      ...((json.cleanupInstruction ? [instructionDataToTransactionInstruction(json.cleanupInstruction)!] : []) as any[]),
    ],
  }).compileToV0Message(addressLookupTableAccounts)

  const tx = new VersionedTransaction(messageV0)
  tx.sign([wallet.payer])
  try {
    await execTx(tx, { blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight })
    console.log(`Attempted to sell ${amountIn} base units of ${INPUT_MINT.toBase58()} => WSOL`)
    return
  } catch (e: any) {
    // Print detailed logs if available
    const SendTransactionError = (await import('@solana/web3.js')).SendTransactionError
    let logs: string[] | null = null
    if (e instanceof SendTransactionError) {
      logs = await e.getLogs(connection).catch(() => null)
      console.error('send error logs:', logs)
    } else {
      console.error('send error:', e?.message || e)
    }

  // Lite-API fallback: re-quote excluding Simple and allow multi-hop if we didn't already
    try {
      const q2 = new URL('/swap/v1/quote', LITE_API)
      q2.searchParams.set('inputMint', INPUT_MINT.toBase58())
      q2.searchParams.set('outputMint', SOL.toBase58())
      q2.searchParams.set('amount', String(amountIn))
      q2.searchParams.set('slippageBps', String(process.env.SLIPPAGE_BPS || '100'))
      q2.searchParams.set('onlyDirectRoutes', 'false')
      q2.searchParams.set('excludeDexes', 'Simple')
      const quote2 = await fetch(q2.toString()).then((r) => r.json())
      if (!quote2 || !quote2.routePlan?.length) throw new Error('No route from lite-api fallback')

      const body2: any = {
        quoteResponse: quote2,
        userPublicKey: fundPda.toBase58(),
        payer: wallet.publicKey.toBase58(),
        userSourceTokenAccount: sourceAta.toBase58(),
        userDestinationTokenAccount: wsolAta.toBase58(),
        wrapAndUnwrapSol: false,
        prioritizationFeeLamports: 0,
        useTokenLedger: false,
        useSharedAccounts: false,
        skipUserAccountsRpcCalls: true,
        skipAtaCreation: true,
      }
      const fallResp = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body2),
      })
      if (!fallResp.ok) {
        const txt = await fallResp.text()
        throw new Error(`fallback swap-instructions error ${fallResp.status}: ${txt}`)
      }
      const fallJson = await fallResp.json()
      if (fallJson.error) throw new Error('Failed to get fallback swap instructions: ' + fallJson.error)

      const routerIxData2 = fallJson.swapInstruction
      const legIx2 = instructionDataToTransactionInstruction(routerIxData2)!
      const legData2 = Buffer.from(routerIxData2.data, 'base64')
      const meta2 = legIx2.keys.find((k) => k.pubkey.toBase58() === fundPda.toBase58())
      if (meta2) meta2.isSigner = false
      const alts2 = await getAdressLookupTableAccounts(fallJson.addressLookupTableAddresses || [])
      const blockhash2 = await connection.getLatestBlockhash()
      const messageV0b = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash2.blockhash,
        instructions: [
          ...setupIxs,
          addPriorityFee,
          modifyComputeUnits,
          ...(((fallJson.setupInstructions as any[]) || []).map(instructionDataToTransactionInstruction).filter(Boolean)),
          toProgramIx(legIx2, legData2),
          ...((fallJson.cleanupInstruction ? [instructionDataToTransactionInstruction(fallJson.cleanupInstruction)!] : []) as any[]),
        ],
      }).compileToV0Message(alts2)
      const tx2 = new VersionedTransaction(messageV0b)
      tx2.sign([wallet.payer])
      await execTx(tx2, { blockhash: blockhash2.blockhash, lastValidBlockHeight: blockhash2.lastValidBlockHeight })
      console.log('[fallback/lite] Attempted to sell', amountIn, 'base units of', INPUT_MINT.toBase58(), '=> WSOL')
    } catch (e2) {
      console.error('fallback path failed:', (e2 as any)?.message || e2)

      // If failing due to SystemProgram::transfer from PDA, switch to delegate-EOA pattern:
      // 1) Approve manager as delegate on Fund source ATA for amountIn
      // 2) Build Jupiter swap with manager as user, source = Fund source ATA (delegate flow), destination = Fund WSOL ATA
      // 3) Revoke delegate after swap, all in one tx
      try {
        const indicatesPdaSystemError = Array.isArray(logs) && logs.some((l) => String(l).includes('Transfer: `from` must not carry data'))
        if (!indicatesPdaSystemError) throw new Error('EOA fallback skipped (no PDA system transfer error detected)')

        // Approve manager as delegate on Fund source ATA
        const dataApprove = coder.instruction.encode('pda_token_approve', { amount: new anchor.BN(amountIn) })
        const keysApprove = [
          { pubkey: fundPda, isWritable: true, isSigner: false },
          { pubkey: sourceAta, isWritable: true, isSigner: false },
          { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: wallet.publicKey, isWritable: false, isSigner: true },
        ]
        const ixApprove = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys: keysApprove, data: dataApprove })

        // Reuse quote (or re-quote) and request swap-instructions for manager as user
        const q3 = new URL('/swap/v1/quote', LITE_API)
        q3.searchParams.set('inputMint', INPUT_MINT.toBase58())
        q3.searchParams.set('outputMint', SOL.toBase58())
        q3.searchParams.set('amount', String(amountIn))
        q3.searchParams.set('slippageBps', String(process.env.SLIPPAGE_BPS || '100'))
        q3.searchParams.set('onlyDirectRoutes', 'false')
        if (excludeDexes.length > 0) q3.searchParams.set('excludeDexes', excludeDexes)
        const quote3 = await fetch(q3.toString()).then((r) => r.json())
        if (!quote3 || !quote3.routePlan?.length) throw new Error('EOA fallback: no route from lite-api')

        // Ensure manager has an ATA for INPUT_MINT (source for swap after delegated transfer)
        const managerSourceAta = getAssociatedTokenAddressSync(INPUT_MINT, wallet.publicKey, false)
        const managerSrcInfo = await connection.getAccountInfo(managerSourceAta)
        const ensureManagerAtaIx = managerSrcInfo
          ? []
          : [createAssociatedTokenAccountInstruction(wallet.publicKey, managerSourceAta, wallet.publicKey, INPUT_MINT)]

        const body3: any = {
          quoteResponse: quote3,
          userPublicKey: wallet.publicKey.toBase58(),
          payer: wallet.publicKey.toBase58(),
          userSourceTokenAccount: managerSourceAta.toBase58(), // Manager-owned after delegate transfer
          destinationTokenAccount: wsolAta.toBase58(), // deliver WSOL to Fund ATA directly
          wrapAndUnwrapSol: false,
          prioritizationFeeLamports: 'auto',
          // No token ledger needed; we move tokens to manager ATA first
          useTokenLedger: false,
          useSharedAccounts: false,
          skipUserAccountsRpcCalls: true,
          skipAtaCreation: true,
        }
        const resp3 = await fetch(new URL('/swap/v1/swap-instructions', LITE_API).toString(), {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body3),
        })
        if (!resp3.ok) {
          const txt = await resp3.text()
          throw new Error(`EOA fallback swap-instructions error ${resp3.status}: ${txt}`)
        }
        const j3 = await resp3.json()
        const alts3 = await getAdressLookupTableAccounts((j3.addressLookupTableAddresses || []))
        const blockhash3 = await connection.getLatestBlockhash()
        // Use delegate authority (manager) to move amountIn from Fund source ATA to manager's ATA
        const delegatedMoveIx = createTransferInstruction(
          sourceAta,
          managerSourceAta,
          wallet.publicKey, // manager is approved delegate authority
          BigInt(amountIn)
        )
        const ixs3 = [
          // Ensure ATAs exist for Fund (source/destination) before approval and swap
          ...setupIxs,
          // Ensure manager ATA exists
          ...ensureManagerAtaIx,
          ixApprove,
          addPriorityFee,
          modifyComputeUnits,
          // Move tokens to manager's ATA using delegate
          delegatedMoveIx,
          ...(((j3.setupInstructions as any[]) || []).map(instructionDataToTransactionInstruction).filter(Boolean)),
          instructionDataToTransactionInstruction(j3.swapInstruction)!,
          ...((j3.cleanupInstruction ? [instructionDataToTransactionInstruction(j3.cleanupInstruction)!] : []) as any[]),
        ]
        // Revoke delegate after swap
        const dataRevoke = coder.instruction.encode('pda_token_revoke', {})
        const keysRevoke = [
          { pubkey: fundPda, isWritable: true, isSigner: false },
          { pubkey: sourceAta, isWritable: true, isSigner: false },
          { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
          { pubkey: wallet.publicKey, isWritable: false, isSigner: true },
        ]
        const ixRevoke = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys: keysRevoke, data: dataRevoke })
        ixs3.push(ixRevoke)
        const msg3 = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash3.blockhash, instructions: ixs3 }).compileToV0Message(alts3)
        const tx3 = new VersionedTransaction(msg3)
        tx3.sign([wallet.payer])
        await execTx(tx3, { blockhash: blockhash3.blockhash, lastValidBlockHeight: blockhash3.lastValidBlockHeight })
        console.log('[fallback/eoa-delegate] Approved delegate, swapped to WSOL delivered to Fund ATA, then revoked')
      } catch (e3) {
        console.error('EOA fallback failed:', (e3 as any)?.message || e3)
      }
    }
  }
})()
