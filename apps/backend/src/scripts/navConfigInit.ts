import 'dotenv/config'
import bs58 from 'bs58'
import { AnchorProvider, Wallet } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { connection, idl, programId } from './helper'

const MANAGER_SECRET_BASE58 = process.env.MANAGER_SECRET_BASE58 || ''
const FUND_PUBKEY = process.env.FUND_PUBKEY || ''
const NAV_ATTESTOR_PUBKEY = process.env.NAV_ATTESTOR_PUBKEY || ''

if (!MANAGER_SECRET_BASE58) {
  console.error('Missing MANAGER_SECRET_BASE58')
  process.exit(1)
}
if (!FUND_PUBKEY) {
  console.error('Missing FUND_PUBKEY')
  process.exit(1)
}
if (!NAV_ATTESTOR_PUBKEY) {
  console.error('Missing NAV_ATTESTOR_PUBKEY')
  process.exit(1)
}

;(async () => {
  const managerKeypair = (() => {
    const bytes = bs58.decode(MANAGER_SECRET_BASE58)
    const { Keypair } = require('@solana/web3.js')
    return Keypair.fromSecretKey(bytes, { skipValidation: true })
  })()
  const wallet = new Wallet(managerKeypair)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'processed' })
  const anchor: any = require('@coral-xyz/anchor')
  const program = new anchor.Program(idl as any, programId, provider)

  const fundPda = new PublicKey(FUND_PUBKEY)
  const attestor = new PublicKey(NAV_ATTESTOR_PUBKEY)

  const [navConfigPda] = await PublicKey.findProgramAddress([Buffer.from('nav_cfg'), fundPda.toBuffer()], program.programId)

  const ix = await program.methods
    .navConfigInit()
    .accounts({
      fund: fundPda,
      manager: wallet.publicKey,
      navConfig: navConfigPda,
      attestor,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const tx = new (await import('@solana/web3.js')).Transaction().add(ix)
  tx.feePayer = wallet.publicKey
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
  tx.sign(managerKeypair)
  const { execTx } = await import('./helper')
  await execTx(tx)
  console.log('nav_config_init sent. nav_config:', navConfigPda.toBase58())
})().catch(e => { console.error('navConfigInit failed:', e?.message || e); process.exit(1) })
