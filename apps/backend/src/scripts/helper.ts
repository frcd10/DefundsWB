import 'dotenv/config'
import * as anchor from '@coral-xyz/anchor'
import { Wallet, AnchorProvider } from '@coral-xyz/anchor'
import fs from 'fs'
import path from 'path'
import bs58 from 'bs58'
import {
  PublicKey,
  Keypair,
  Connection,
  AddressLookupTableAccount,
  TransactionInstruction,
  ConnectionConfig,
} from '@solana/web3.js'

export const programId = new PublicKey(process.env.SOLANA_PROGRAM_ID!)
export const jupiterProgramId = new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4')

// Wallet from MANAGER_SECRET_BASE58 (base58-encoded secret key)
const secret = process.env.MANAGER_SECRET_BASE58!
const walletKeypair = Keypair.fromSecretKey(bs58.decode(secret), { skipValidation: true })
export const wallet = new Wallet(walletKeypair)

const config: ConnectionConfig = {
  commitment: 'confirmed',
  disableRetryOnRateLimit: false,
  confirmTransactionInitialTimeout: 60_000,
}
export const connection = new Connection(process.env.SOLANA_RPC_URL!, config)
export const provider = new AnchorProvider(connection, wallet, { commitment: 'processed' })
anchor.setProvider(provider)
const repoRoot = path.resolve(__dirname, '../../../..')
const idlPath = path.join(repoRoot, 'target', 'idl', 'managed_funds.json')
export const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'))

export const VAULT_SEED = 'vault-authority'
// Fund PDA (program authority), owner of the vault token accounts
export const fundPda = new PublicKey(
  process.env.FUND_PUBKEY || '99c9jpi48swS5SLvT8wN9LPokrcVmgZ5R41uSuo1oRML',
)
// Vault token account (WSOL or base mint) to be swapped from; used only to verify addresses in logs if needed
export const vault = new PublicKey(process.env.VAULT_TOKEN_ACCOUNT_PUBKEY || '99c9jpi48swS5SLvT8wN9LPokrcVmgZ5R41uSuo1oRML')
export const fundPubkey = process.env.FUND_PUBKEY ? new PublicKey(process.env.FUND_PUBKEY) : new PublicKey('6tWrk6DZjRzvhrrPKxeXM6NyErYgrHVRh7F489bXoZfA')

export const getAdressLookupTableAccounts = async (
  keys: string[],
): Promise<AddressLookupTableAccount[]> => {
  const infos = await connection.getMultipleAccountsInfo(keys.map((k) => new PublicKey(k)))
  return infos.reduce((acc, accountInfo, index) => {
    const address = keys[index]
    if (accountInfo) {
      const alt = new AddressLookupTableAccount({
        key: new PublicKey(address),
        state: AddressLookupTableAccount.deserialize(accountInfo.data),
      })
      acc.push(alt)
    }
    return acc
  }, new Array<AddressLookupTableAccount>())
}

export const instructionDataToTransactionInstruction = (instructionPayload: any) => {
  if (!instructionPayload) return null
  return new TransactionInstruction({
    programId: new PublicKey(instructionPayload.programId),
    keys: instructionPayload.accounts.map((k: any) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(instructionPayload.data, 'base64'),
  })
}

export const execTx = async (
  raw: anchor.web3.Transaction | anchor.web3.VersionedTransaction,
  opts?: { blockhash?: string; lastValidBlockHeight?: number },
) => {
  const rawBytes = raw.serialize()
  const txid = await connection.sendRawTransaction(rawBytes, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: 'processed',
  })
  console.log(`https://solscan.io/tx/${txid}`)
  try {
    if (opts?.blockhash && opts?.lastValidBlockHeight) {
      const res = await connection.confirmTransaction(
        { signature: txid, blockhash: opts.blockhash, lastValidBlockHeight: opts.lastValidBlockHeight },
        'confirmed',
      )
      console.log('confirmation err:', res.value.err)
    } else {
      const res = await connection.confirmTransaction(txid, 'confirmed')
      console.log('confirmation err:', res.value.err)
    }
  } catch (e: any) {
    console.error('confirmTransaction threw:', e?.message || e)
    // Try to fetch status as a fallback
    try {
      const statuses = await connection.getSignatureStatuses([txid])
      const status = statuses?.value?.[0]
      console.log('status confirmations:', status?.confirmations, 'err:', status?.err)
      if (!status || status.err) {
        const tx = await connection.getTransaction(txid, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        } as any)
        console.log('tx meta err:', tx?.meta?.err)
        if (tx?.meta?.logMessages) {
          console.log('logs:\n' + tx.meta.logMessages.join('\n'))
        }
      }
    } catch (inner) {
      console.error('failed to fetch fallback status:', inner)
    }
  }
  return txid
}
