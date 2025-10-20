import 'dotenv/config'
import bs58 from 'bs58'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import { getAssociatedTokenAddressSync, NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction } from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { connection, idl, programId } from './helper'
import { computeFundNavInUsdcBaseUnits, getMintPriceInUsdcBaseUnits } from '../services/nav.service'

// Env inputs
const INVESTOR_SECRET_BASE58 = process.env.INVESTOR_SECRET_BASE58 || ''
const FUND_PUBKEY = process.env.FUND_PUBKEY || ''
const NAV_ATTEST_EXPIRY_SECS = Number(process.env.NAV_ATTEST_EXPIRY_SECS || '60')
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT_BASE_UNITS

if (!INVESTOR_SECRET_BASE58) {
  console.error('Missing INVESTOR_SECRET_BASE58')
  process.exit(1)
}
if (!FUND_PUBKEY) {
  console.error('Missing FUND_PUBKEY (fund PDA)')
  process.exit(1)
}
if (!DEPOSIT_AMOUNT) {
  console.error('Missing DEPOSIT_AMOUNT_BASE_UNITS (integer in base mint units)')
  process.exit(1)
}

;(async () => {
  const investorKeypair = (() => {
    const bytes = bs58.decode(INVESTOR_SECRET_BASE58)
    const { Keypair } = require('@solana/web3.js')
    return Keypair.fromSecretKey(bytes, { skipValidation: true })
  })()
  const investor = investorKeypair.publicKey
  const wallet = new Wallet(investorKeypair)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'processed' })
  const anchor: any = require('@coral-xyz/anchor')
  const program = new anchor.Program(idl as any, programId, provider)

  const fundPda = new PublicKey(FUND_PUBKEY)
  const fundAcc = await program.account.fund.fetch(fundPda)
  const baseMint: PublicKey = fundAcc.baseMint
  const sharesMint: PublicKey = fundAcc.sharesMint
  const vault: PublicKey = fundAcc.vault

  // Derive PDAs
  const [navAttestationPda] = await PublicKey.findProgramAddress([Buffer.from('nav'), fundPda.toBuffer()], program.programId)
  const [investorPositionPda] = await PublicKey.findProgramAddress([Buffer.from('position'), investor.toBuffer(), fundPda.toBuffer()], program.programId)

  const investorBaseAta = getAssociatedTokenAddressSync(baseMint, investor, false)
  const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investor, false)

  // Compute current NAV off-chain (USDC base units)
  const navUsdc = await computeFundNavInUsdcBaseUnits(fundPda)
  if (navUsdc <= 0n) {
    console.warn('Computed NAV is zero; proceeding but deposit will likely mint at 1:1')
  }
  // Convert NAV (USDC units) to base-mint base units expected by deposit math
  let navValue: bigint = navUsdc
  const usdcMint = new PublicKey(process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  if (!baseMint.equals(usdcMint)) {
    const price = await getMintPriceInUsdcBaseUnits(baseMint)
    if (!price) {
      console.warn('Base mint has no USDC price; using USDC NAV units directly which may be incorrect for share math.')
    } else {
      const info = await connection.getParsedAccountInfo(baseMint)
      const dec = (info.value as any)?.data?.parsed?.info?.decimals
      const decimals = typeof dec === 'number' ? dec : 9
      const oneTokenBaseUnits = BigInt(10) ** BigInt(decimals)
      const basePriceUsdc = BigInt(price.priceBaseUnits)
      if (basePriceUsdc > 0n) {
        navValue = (navUsdc * oneTokenBaseUnits) / basePriceUsdc
      }
    }
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + NAV_ATTEST_EXPIRY_SECS
  // Build instructions
  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })

  const navIx = await program.methods
    .navAttestWrite(new BN(navValue.toString()), new BN(expiresAt))
    .accounts({
      fund: fundPda,
      navAttestation: navAttestationPda,
      payer: investor,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const depositAmount = new BN(DEPOSIT_AMOUNT)
  const depositIx = await program.methods
    .deposit(depositAmount)
    .accounts({
      fund: fundPda,
      vault,
      sharesMint,
      investorPosition: investorPositionPda,
      investorTokenAccount: investorBaseAta,
      investorSharesAccount: investorSharesAta,
      investor,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .remainingAccounts([{ pubkey: navAttestationPda, isWritable: false, isSigner: false }])
    .instruction()

  // If base mint is native (WSOL), wrap SOL before deposit
  const preDepositIxs = [addPriorityFee, modifyComputeUnits, navIx]
  if (baseMint.equals(NATIVE_MINT)) {
    // Create ATA idempotently
    preDepositIxs.push(
      createAssociatedTokenAccountIdempotentInstruction(investor, investorBaseAta, investor, NATIVE_MINT),
    )
    // Transfer lamports into the ATA (wrap SOL)
    const lamports = Number(DEPOSIT_AMOUNT)
    if (!Number.isSafeInteger(lamports)) throw new Error('DEPOSIT_AMOUNT_BASE_UNITS must be a safe integer for SOL lamports')
    preDepositIxs.push(SystemProgram.transfer({ fromPubkey: investor, toPubkey: investorBaseAta, lamports }))
    // Sync native to reflect lamports as token amount
    preDepositIxs.push(createSyncNativeInstruction(investorBaseAta))
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: blockhash, instructions: [...preDepositIxs, depositIx] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])

  const { execTx } = await import('./helper')
  await execTx(tx, { blockhash, lastValidBlockHeight })
  console.log('Deposit sent with NAV attestation. Amount (base units):', depositAmount.toString())
})().catch((e: any) => {
  console.error('investorDeposit failed:', e?.message || e)
  process.exit(1)
})
