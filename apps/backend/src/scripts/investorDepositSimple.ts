import 'dotenv/config'
import bs58 from 'bs58'
import { AnchorProvider, BN, Wallet } from '@coral-xyz/anchor'
import { ASSOCIATED_TOKEN_PROGRAM_ID, NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { ComputeBudgetProgram, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { connection, idl, programId } from './helper'

const INVESTOR_SECRET_BASE58 = process.env.INVESTOR_SECRET_BASE58 || ''
const FUND_PUBKEY = process.env.FUND_PUBKEY || ''
const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT_BASE_UNITS

if (!INVESTOR_SECRET_BASE58) throw new Error('Missing INVESTOR_SECRET_BASE58')
if (!FUND_PUBKEY) throw new Error('Missing FUND_PUBKEY')
if (!DEPOSIT_AMOUNT) throw new Error('Missing DEPOSIT_AMOUNT_BASE_UNITS')

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

  const [investorPositionPda] = await PublicKey.findProgramAddress([Buffer.from('position'), investor.toBuffer(), fundPda.toBuffer()], program.programId)
  const investorBaseAta = getAssociatedTokenAddressSync(baseMint, investor, false)
  const investorSharesAta = getAssociatedTokenAddressSync(sharesMint, investor, false)

  const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000 })
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })

  const ixs: any[] = [addPriorityFee, modifyComputeUnits]
  if (baseMint.equals(NATIVE_MINT)) {
    // Create WSOL ATA and wrap the SOL amount
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(investor, investorBaseAta, investor, NATIVE_MINT))
    const lamports = Number(DEPOSIT_AMOUNT)
    if (!Number.isSafeInteger(lamports)) throw new Error('DEPOSIT_AMOUNT_BASE_UNITS must be a safe integer for SOL lamports')
    ixs.push(SystemProgram.transfer({ fromPubkey: investor, toPubkey: investorBaseAta, lamports }))
    ixs.push(createSyncNativeInstruction(investorBaseAta))
  }

  const depositIx = await program.methods
    .deposit(new BN(DEPOSIT_AMOUNT))
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
    .instruction()

  ixs.push(depositIx)

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const msg = new TransactionMessage({ payerKey: investor, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([investorKeypair])
  const { execTx } = await import('./helper')
  await execTx(tx, { blockhash, lastValidBlockHeight })
  console.log('Simple deposit sent. Amount (base units):', DEPOSIT_AMOUNT)
})().catch((e: any) => {
  console.error('investorDepositSimple failed:', e?.message || e)
  process.exit(1)
})
