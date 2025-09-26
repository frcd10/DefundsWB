#!/usr/bin/env ts-node
/*
  validatePayout.ts

  End-to-end validator for fund payout prerequisites.
  It will:
   1. Load environment (PROGRAM_ID, RPC, optional TREASURY, FUND_ID, AMOUNT, INVESTORS list)
   2. Derive all PDAs (fund, vault, vault_sol, temp_wsol, shares mint)
   3. Fetch and verify Fund account integrity (owner, discriminator length heuristic)
   4. Fetch vault token account and assert owner == TOKEN_PROGRAM_ID and length == 165
   5. Recompute stored vault equals derived vault
   6. Optionally attempt a simulation (dry-run) of pay_fund_investors using a dummy keypair (no signature sent) to detect ordering/ownership errors early
   7. Print a PASS/FAIL summary with actionable remediation steps.

  Usage examples:
    npx ts-node scripts/validatePayout.ts --fund <FUND_PUBKEY> --amount 0.1 --investors <INV1,INV2,...> --treasury <TREASURY_PUBKEY>
    FUND_ID=<FUND> AMOUNT=0.25 INVESTORS="INV1,INV2" npm run validate:payout

  You must provide a manager keypair (payer) for simulation via MANAGER_KEYPAIR (path) or default ~/.config/solana/id.json.
*/

import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
// Anchor in this workspace is CommonJS; import default and destructure
import anchorPkg from '@coral-xyz/anchor';
const { BN, AnchorProvider } = anchorPkg as any;
type Idl = any;
import { TOKEN_PROGRAM_ID, NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';

interface CliArgs {
  fund?: string;
  amount?: string;
  investors?: string;
  treasury?: string;
  rpc?: string;
  programId?: string;
  managerKeypair?: string;
  skipSim?: boolean;
  skipManagerCheck?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fund') args.fund = argv[++i];
    else if (a === '--amount') args.amount = argv[++i];
    else if (a === '--investors') args.investors = argv[++i];
    else if (a === '--treasury') args.treasury = argv[++i];
    else if (a === '--rpc') args.rpc = argv[++i];
    else if (a === '--program-id') args.programId = argv[++i];
    else if (a === '--manager') args.managerKeypair = argv[++i];
    else if (a === '--skip-sim') args.skipSim = true;
  else if (a === '--skip-manager-check') args.skipManagerCheck = true;
  }
  return args;
}

async function loadIdl(programId: PublicKey): Promise<Idl> {
  // Prefer local target IDL; fallback to apps/web/public copy
  const local = path.join(process.cwd(), 'target', 'idl', 'managed_funds.json');
  if (!fs.existsSync(local)) throw new Error('IDL not found at target/idl/managed_funds.json – build first.');
  const raw = fs.readFileSync(local, 'utf8');
  const idl = JSON.parse(raw);
  // Sanity check program id
  const idlPid = new PublicKey(idl.address || idl.metadata?.address || idl.metadata?.address_v2 || idl.programId || programId.toBase58());
  if (!idlPid.equals(programId)) {
    console.warn('[warn] IDL program id mismatch', { idlPid: idlPid.toBase58(), programId: programId.toBase58() });
  }
  return idl;
}

function loadKeypair(pathStr?: string): Keypair {
  const p = pathStr || path.join(process.env.HOME || '~', '.config', 'solana', 'id.json');
  const secret = JSON.parse(fs.readFileSync(p, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function fail(msg: string, extra?: unknown): never {
  console.error('\n[FAIL]', msg);
  if (extra) console.error('[context]', extra);
  process.exit(1);
}

(async () => {
  const cli = parseArgs();
  const FUND = cli.fund || process.env.FUND_ID;
  const AMOUNT_SOL = cli.amount || process.env.AMOUNT;
  const INVESTORS = (cli.investors || process.env.INVESTORS || '').split(',').filter(Boolean);
  const TREASURY = cli.treasury || process.env.TREASURY;
  const RPC = cli.rpc || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const PROGRAM_ID = new PublicKey(cli.programId || process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || process.env.SOLANA_PROGRAM_ID || fail('PROGRAM_ID missing (set NEXT_PUBLIC_SOLANA_PROGRAM_ID).'));
  const manager = loadKeypair(cli.managerKeypair || process.env.MANAGER_KEYPAIR);

  if (!FUND) fail('Fund pubkey required: --fund or FUND_ID env');
  if (!AMOUNT_SOL) fail('Amount (SOL) required: --amount or AMOUNT env');
  if (!TREASURY) fail('Treasury pubkey required: --treasury or TREASURY env');
  if (INVESTORS.length === 0) fail('At least one investor required via --investors or INVESTORS env (comma separated)');

  const fundPk = new PublicKey(FUND);
  const treasuryPk = new PublicKey(TREASURY);
  const investorPks = INVESTORS.map(s => new PublicKey(s));
  const amountLamports = Math.floor(parseFloat(AMOUNT_SOL) * LAMPORTS_PER_SOL);
  if (amountLamports <= 0) fail('Amount must be > 0');

  const connection = new Connection(RPC, 'confirmed');
  console.log('[info] RPC', RPC);
  console.log('[info] Program ID', PROGRAM_ID.toBase58());
  console.log('[info] Fund', fundPk.toBase58());

  // Load IDL & program (AnchorProvider with manager payer)
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: manager.publicKey,
      signAllTransactions: async (txs: any[]) => txs,
      signTransaction: async (tx: any) => tx,
    } as any,
    { commitment: 'confirmed' }
  );
  const idl = await loadIdl(PROGRAM_ID);
  // Program constructor signature: (idl, programId, provider)
  // Some Anchor versions expect Program<Idl> generic; force cast to satisfy TS
  // Construct Program instance (wrap in try/catch in case IDL account layout mismatch)
    // NOTE: Skipping Anchor Program client construction because IDL lacks account layout sizes (causing TS client crash).
    // We'll manually craft the instruction using the discriminator and argument serialization.

  // PDAs
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), fundPk.toBuffer()], PROGRAM_ID);
  const [vaultSolPda] = PublicKey.findProgramAddressSync([Buffer.from('vault_sol'), fundPk.toBuffer()], PROGRAM_ID);
  const [sharesMintPda] = PublicKey.findProgramAddressSync([Buffer.from('shares'), fundPk.toBuffer()], PROGRAM_ID);
  const [tempWsolPda] = PublicKey.findProgramAddressSync([Buffer.from('vault_sol_temp'), fundPk.toBuffer()], PROGRAM_ID);

  console.log('[pdas]', { vault: vaultPda.toBase58(), vaultSol: vaultSolPda.toBase58(), sharesMint: sharesMintPda.toBase58(), tempWsol: tempWsolPda.toBase58() });

  // Fetch fund raw
  const fundInfo = await connection.getAccountInfo(fundPk);
  if (!fundInfo) fail('Fund account missing on-chain');
  if (!fundInfo.owner.equals(PROGRAM_ID)) fail('Fund owner mismatch', { owner: fundInfo.owner.toBase58() });

  // Manual decode of Fund account (since Anchor Program client wasn't constructed)
  function decodeString(buf: Buffer, offset: number): [string, number] {
    if (offset + 4 > buf.length) throw new Error('String length prefix OOB');
    const len = buf.readUInt32LE(offset);
    offset += 4;
    if (offset + len > buf.length) throw new Error('String bytes OOB');
    const str = buf.slice(offset, offset + len).toString('utf8');
    offset += len;
    return [str, offset];
  }
  function readPubkey(buf: Buffer, offset: number): [PublicKey, number] {
    if (offset + 32 > buf.length) throw new Error('Pubkey OOB');
    return [new PublicKey(buf.slice(offset, offset + 32)), offset + 32];
  }
  let o = 8; // skip discriminator
  try {
    const [managerPk, o1] = readPubkey(fundInfo.data, o); o = o1;
    const [name, o2] = decodeString(fundInfo.data, o); o = o2;
    const [description, o3] = decodeString(fundInfo.data, o); o = o3;
    const [baseMint, o4] = readPubkey(fundInfo.data, o); o = o4;
    const [storedVault, o5] = readPubkey(fundInfo.data, o); o = o5;
    const [sharesMint, o6] = readPubkey(fundInfo.data, o); o = o6;
    if (o + 2 + 2 + 8 + 8 + 8 + 8 + 1 + 1 + 1 > fundInfo.data.length) throw new Error('Fund account truncated');
    const managementFee = fundInfo.data.readUInt16LE(o); o += 2;
    const performanceFee = fundInfo.data.readUInt16LE(o); o += 2;
    const totalShares = fundInfo.data.readBigUInt64LE(o); o += 8;
    const totalAssets = fundInfo.data.readBigUInt64LE(o); o += 8;
    const lastFeeCollection = fundInfo.data.readBigInt64LE(o); o += 8;
    const createdAt = fundInfo.data.readBigInt64LE(o); o += 8;
    const bump = fundInfo.data.readUInt8(o); o += 1;
    const vaultBump = fundInfo.data.readUInt8(o); o += 1;
    const sharesBump = fundInfo.data.readUInt8(o); o += 1;

    if (!storedVault.equals(vaultPda)) fail('Stored vault != derived vault', { stored: storedVault.toBase58(), derived: vaultPda.toBase58() });
    if (!managerPk.equals(manager.publicKey) && !cli.skipManagerCheck) {
      fail('Manager keypair provided does not match fund.manager', { fundManager: managerPk.toBase58(), provided: manager.publicKey.toBase58(), remedy: 'Pass correct keypair with --manager /path/to/id.json or use --skip-manager-check to continue static analysis.' });
    } else if (!managerPk.equals(manager.publicKey) && cli.skipManagerCheck) {
      console.warn('[warn] Manager mismatch ignored due to --skip-manager-check');
    }

    console.log('[fund]', {
      manager: managerPk.toBase58(),
      name,
      description: description.slice(0, 40) + (description.length > 40 ? '…' : ''),
      baseMint: baseMint.toBase58(),
      storedVault: storedVault.toBase58(),
      sharesMint: sharesMint.toBase58(),
      managementFee,
      performanceFee,
      totalShares: totalShares.toString(),
      totalAssets: totalAssets.toString(),
      lastFeeCollection: lastFeeCollection.toString(),
      createdAt: createdAt.toString(),
      bump,
      vaultBump,
      sharesBump,
    });
  } catch (e) {
    fail('Manual Fund decode failed', (e as Error).message);
  }

  // base mint for later use (reuse variable name baseMint)
  const baseMintInfo = fundInfo.data.slice(8); // after discriminator
  // We already decoded; re-derive baseMint again cleaner by re-decoding; for clarity reuse earlier variable inside closure above
  // To avoid scope complexities we decode again quickly
  let baseMint: PublicKey; {
    let off = 8 + 32; // manager
    const [_, off2] = decodeString(fundInfo.data, off); off = off2; // name
    const [__, off3] = decodeString(fundInfo.data, off); off = off3; // description
    [baseMint, off] = readPubkey(fundInfo.data, off);
  }

  // Vault token account checks
  const vaultInfo = await connection.getAccountInfo(vaultPda);
  if (!vaultInfo) fail('Vault token account missing');
  if (!vaultInfo.owner.equals(TOKEN_PROGRAM_ID)) fail('Vault owner not Token Program', { owner: vaultInfo.owner.toBase58() });
  if (vaultInfo.data.length !== 165) fail('Vault size not 165 (not a token account)', { len: vaultInfo.data.length });
  console.log('[vault-ok]', { owner: vaultInfo.owner.toBase58(), len: vaultInfo.data.length });

  // Pre-flight: ensure each investor position exists (optional) just fetch account, ignore if missing
  for (const pk of investorPks) {
    const [positionPda] = PublicKey.findProgramAddressSync([Buffer.from('position'), pk.toBuffer(), fundPk.toBuffer()], PROGRAM_ID);
    const posInfo = await connection.getAccountInfo(positionPda);
    console.log('[position]', pk.toBase58(), 'pda', positionPda.toBase58(), posInfo ? 'exists' : 'MISSING');
  }

  // Manager keypair must match fund.manager for simulation
  // Re-decode manager pubkey quickly (already decoded in detailed log above but re-derive to keep scope simple)
  const fundData = fundInfo.data;
  const fundManagerPk = new PublicKey(fundData.slice(8, 8 + 32));
  if (!fundManagerPk.equals(manager.publicKey)) {
    console.warn('[warn] Provided manager keypair does not match fund.manager');
    console.warn('       fund.manager      :', fundManagerPk.toBase58());
    console.warn('       supplied keypair  :', manager.publicKey.toBase58());
    if (!cli.skipManagerCheck) {
      if (!cli.skipSim) {
        fail('Manager mismatch (use --skip-sim or --skip-manager-check for static diagnostics)');
      }
    } else {
      console.log('[info] Continuing despite manager mismatch due to --skip-manager-check');
    }
  }

  if (cli.skipSim) {
    console.log('[info] --skip-sim flag provided; skipping instruction simulation.');
    console.log('\nPASS: Static payout prerequisites satisfied.');
    process.exit(0);
  }

  // Build (simulate) instruction using manual instruction (accounts in correct order)
  try {
      // Discriminator for pay_fund_investors from IDL
      const discriminator = Uint8Array.from([106, 88, 202, 106, 90, 54, 97, 75]);
      const amountBytes = new BN(amountLamports).toArray('le', 8);
      const data = Buffer.concat([Buffer.from(discriminator), Buffer.from(amountBytes)]);

      const keys = [
        { pubkey: manager.publicKey, isSigner: true, isWritable: true },
        { pubkey: fundPk, isSigner: false, isWritable: true },
        { pubkey: vaultSolPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: baseMint, isSigner: false, isWritable: false },
        { pubkey: tempWsolPda, isSigner: false, isWritable: true },
        { pubkey: treasuryPk, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ];

      const instruction = new (anchorPkg as any).web3.TransactionInstruction({ programId: PROGRAM_ID, keys, data });
      const tx = new Transaction().add(instruction);
      tx.feePayer = manager.publicKey;
      const sim = await connection.simulateTransaction(tx, [manager]);
      if (sim.value.err) {
        console.error('[simulate-error]', sim.value.err, sim.value.logs);
        fail('Simulation failed (see logs above)');
      } else {
        console.log('[simulate-ok] base accounts accepted (manual ix)');
      }
  } catch (e) {
      fail('Failed to manually build or simulate pay_fund_investors', (e as Error).message);
  }

  console.log('\nPASS: Payout prerequisites satisfied. You can now attempt real payout with investor accounts.');
  process.exit(0);
})();
