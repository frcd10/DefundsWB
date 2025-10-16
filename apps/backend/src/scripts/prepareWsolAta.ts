import 'dotenv/config'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from '@solana/spl-token'
import { SystemProgram, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { fundPda, wallet, connection, idl, programId, execTx } from './helper'

(async () => {
  const SOL = new PublicKey('So11111111111111111111111111111111111111112')
  const EXISTING_WSOL_TA = new PublicKey(process.env.VAULT_SOURCE_TA || 'GmvLEAhM97T9AkridswySU3ATgvbnxGwMmUFTwJ9vZDm')
  const amount = Number(process.env.WSOL_TRANSFER_LAMPORTS || '100000') // default 0.0001 SOL

  const ata = getAssociatedTokenAddressSync(SOL, fundPda, true)
  const ataInfo = await connection.getAccountInfo(ata)
  const ixs = [] as any[]
  if (!ataInfo) {
    const ataIx = createAssociatedTokenAccountInstruction(wallet.publicKey, ata, fundPda, SOL)
    ixs.push(ataIx)
  }

  // Build program instruction to transfer from existing WSOL TA to ATA
  const anchor = require('@coral-xyz/anchor') as any
  const coder = new anchor.BorshCoder(idl)
  const data = coder.instruction.encode('pda_token_transfer', { amount: new anchor.BN(amount) })
  const keys = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: EXISTING_WSOL_TA, isWritable: true, isSigner: false },
    { pubkey: ata, isWritable: true, isSigner: false },
    { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
  ]
  const progIx = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })
  ixs.push(progIx)

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const message = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()
  const tx = new VersionedTransaction(message)
  tx.sign([wallet.payer])
  await execTx(tx, { blockhash, lastValidBlockHeight })
  console.log('WSOL ATA prepared at', ata.toBase58())
})()
