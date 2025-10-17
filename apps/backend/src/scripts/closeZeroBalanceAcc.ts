import 'dotenv/config'
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { fundPda, wallet, connection, idl, programId, execTx } from './helper'

;(async () => {
  const anchor = require('@coral-xyz/anchor') as any
  const coder = new anchor.BorshCoder(idl)

  // Destination: Fund WSOL ATA (lamports from closures will be sent here)
  const WSOL = new PublicKey('So11111111111111111111111111111111111111112')
  const fundWsolAta = getAssociatedTokenAddressSync(WSOL, fundPda, true)

  // Fetch all token accounts owned by the Fund PDA
  const resp = await connection.getTokenAccountsByOwner(fundPda, { programId: TOKEN_PROGRAM_ID })

  // Filter zero-balance accounts
  const zeroAccounts = [] as { pubkey: PublicKey }[]
  for (const { pubkey } of resp.value) {
    try {
      const bal = await connection.getTokenAccountBalance(pubkey)
      if (bal?.value?.amount === '0') {
        zeroAccounts.push({ pubkey })
      }
    } catch (_) {}
  }

  if (zeroAccounts.length === 0) {
    console.log('No zero-balance Fund token accounts to close.')
    return
  }

  // Build instruction: close_zero_token_accounts, passing zero accounts as remaining accounts
  const keys = [
    { pubkey: fundPda, isWritable: true, isSigner: false },
    { pubkey: fundWsolAta, isWritable: true, isSigner: false },
    { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ...zeroAccounts.map(({ pubkey }) => ({ pubkey, isWritable: true, isSigner: false })),
  ]
  const data = coder.instruction.encode('close_zero_token_accounts', {})
  const ix = new (require('@solana/web3.js') as any).TransactionInstruction({ programId, keys, data })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const msg = new TransactionMessage({ payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions: [ix] }).compileToV0Message()
  const tx = new VersionedTransaction(msg)
  tx.sign([wallet.payer])

  await execTx(tx, { blockhash, lastValidBlockHeight })
  console.log(`Requested closing ${zeroAccounts.length} zero-balance accounts. Destination WSOL ATA: ${fundWsolAta.toBase58()}`)
})()
