import { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { WalletContextState } from '@solana/wallet-adapter-react';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } from '@solana/spl-token';

// Program ID - from env (must be provided)
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || process.env.SOLANA_PROGRAM_ID || '');

// We'll load the full IDL at runtime from /public/managed_funds.json.
let cachedIdl: Idl | null = null;
async function loadIdl(): Promise<Idl> {
  if (cachedIdl) return cachedIdl;
  const res = await fetch('/managed_funds.json', { cache: 'no-store' });
  if (!res.ok) {
    const details = `status=${res.status} ${res.statusText}`;
    throw new Error(
      `Failed to load program IDL from /managed_funds.json (${details}). ` +
      `Ensure the file exists at apps/web/public/managed_funds.json (from target/idl/managed_funds.json).`
    );
  }
  const idl = (await res.json()) as Idl;
  cachedIdl = idl;
  return idl;
}

export interface CreateFundParams {
  name: string;
  description: string;
  fundType: string;
  performanceFee: number;
  maxCapacity: number;
  isPublic: boolean;
  initialDeposit: number; // in SOL
}

export interface SolanaFund {
  id: string;
  manager: string;
  name: string;
  description: string;
  fundType: string;
  totalDeposits: number;
  totalShares: number;
  performanceFee: number;
  maxCapacity: number;
  isPublic: boolean;
  createdAt: number;
  userShare?: number;
  userSharePercentage?: number;
}

export class SolanaFundService {
  private connection: Connection;
  private program: Program | null = null;

  constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private async getProgram(wallet: WalletContextState) {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const provider = new AnchorProvider(
      this.connection,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wallet as any,
      { commitment: 'confirmed' }
    );

  const idl = await loadIdl();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const program = new Program(idl as any, provider);
  // Sanity check: ensure IDL metadata programId matches env PROGRAM_ID
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadedId = (program as any).programId?.toString?.();
    if (loadedId && loadedId !== PROGRAM_ID.toString()) {
      console.warn('Program ID mismatch between IDL metadata and NEXT_PUBLIC_SOLANA_PROGRAM_ID:', {
        idlProgramId: loadedId,
        envProgramId: PROGRAM_ID.toString(),
      });
    }
  } catch {}
  return program;
  }

  async createFund(wallet: WalletContextState, params: CreateFundParams): Promise<{ fundId: string; signature: string }> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Creating REAL fund via initialize_fund instruction...');
      console.log('Wallet:', wallet.publicKey.toString());
      console.log('Program ID:', PROGRAM_ID.toString());
      // Load program from full IDL
      const program = await this.getProgram(wallet);

  // Sanitize name/description to fit on-chain struct space
      const name = params.name.slice(0, 32);
      const description = params.description.slice(0, 100);

      // Convert fees to basis points; default 2% management fee if not provided in UI
      const managementFeeBps = 200; // 2%
      const performanceFeeBps = Math.max(0, Math.floor(params.performanceFee * 100));

      // Derive PDAs exactly like in testing.js / on-chain seeds
      const [fundPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('fund'), wallet.publicKey.toBuffer(), Buffer.from(name)],
        program.programId
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), fundPda.toBuffer()],
        program.programId
      );

      const [sharesMintPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('shares'), fundPda.toBuffer()],
        program.programId
      );

      console.log('Fund PDA:', fundPda.toString());
      console.log('Vault PDA:', vaultPda.toString());
      console.log('Shares Mint PDA:', sharesMintPda.toString());

      // Idempotency: if fund already exists, don't try to initialize again
      const [fundInfo, vaultInfo, sharesInfo] = await Promise.all([
        this.connection.getAccountInfo(fundPda),
        this.connection.getAccountInfo(vaultPda),
        this.connection.getAccountInfo(sharesMintPda),
      ]);

      // If initial deposit is requested, compose a single transaction that:
      // 1) initializes the fund, 2) wraps SOL into investor WSOL ATA, 3) calls deposit
      if (fundInfo) {
        // Fund already initialized. If an initial deposit was requested, proceed with deposit-only.
        if (params.initialDeposit && params.initialDeposit > 0) {
          const amountLamports = Math.floor(params.initialDeposit * LAMPORTS_PER_SOL);
          const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
          const tx = new Transaction();

          // Ensure ATA exists and wrap SOL
          const ataInfo = await this.connection.getAccountInfo(investorWsolAta);
          if (!ataInfo) {
            tx.add(
              createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                investorWsolAta,
                wallet.publicKey,
                NATIVE_MINT
              )
            );
          }
          tx.add(SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: investorWsolAta, lamports: amountLamports }));
          tx.add(createSyncNativeInstruction(investorWsolAta));

          const [investorPositionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('position'), wallet.publicKey.toBuffer(), fundPda.toBuffer()],
            program.programId
          );
          const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, wallet.publicKey);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const depositIx = await (program as any).methods
            .deposit(new BN(amountLamports))
            .accounts({
              fund: fundPda,
              vault: vaultPda,
              sharesMint: sharesMintPda,
              investorPosition: investorPositionPda,
              investorTokenAccount: investorWsolAta,
              investorSharesAccount: investorSharesAta,
              investor: wallet.publicKey,
              systemProgram: SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              rent: SYSVAR_RENT_PUBKEY,
            })
            .instruction();

          tx.add(depositIx);

          const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
          tx.recentBlockhash = blockhash;
          tx.feePayer = wallet.publicKey;
          const signed = await wallet.signTransaction(tx);
          const sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 });
          await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
          console.log('deposit-only (existing fund) signature:', sig);
          return { fundId: fundPda.toString(), signature: sig };
        }
        throw new Error('A fund with this name already exists for your wallet. Choose a different name or make a deposit.');
      }

      if (params.initialDeposit && params.initialDeposit > 0) {
        // Build initialize_fund ix
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initIx = await (program as any).methods
          .initializeFund(name, description, managementFeeBps, performanceFeeBps)
          .accounts({
            fund: fundPda,
            vault: vaultPda,
            sharesMint: sharesMintPda,
            baseMint: NATIVE_MINT,
            manager: wallet.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .instruction();

  const amountLamports = Math.floor(params.initialDeposit * LAMPORTS_PER_SOL);

        // Prepare investor WSOL ATA and wrap SOL
        const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
        const tx = new Transaction();

        const ataInfo = await this.connection.getAccountInfo(investorWsolAta);
        if (!ataInfo) {
          tx.add(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey, // payer
              investorWsolAta,   // ata
              wallet.publicKey,  // owner
              NATIVE_MINT        // mint
            )
          );
        }

        tx.add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: investorWsolAta,
            lamports: amountLamports,
          })
        );

        tx.add(createSyncNativeInstruction(investorWsolAta));

        // Derive investor position PDA and investor shares ATA for deposit
        // Derive investor position PDA and investor shares ATA
        const [investorPositionPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('position'), wallet.publicKey.toBuffer(), fundPda.toBuffer()],
          program.programId
        );
        const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, wallet.publicKey);

        // Build deposit ix
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const depositIx = await (program as any).methods
          .deposit(new BN(amountLamports))
          .accounts({
            fund: fundPda,
            vault: vaultPda,
            sharesMint: sharesMintPda,
            investorPosition: investorPositionPda,
            investorTokenAccount: investorWsolAta,
            investorSharesAccount: investorSharesAta,
            investor: wallet.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .instruction();

        // Order matters: init fund -> wrap SOL -> deposit
        tx.add(initIx);
        // wrap SOL steps already added above
        tx.add(depositIx);

  const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
        tx.recentBlockhash = blockhash;
        tx.feePayer = wallet.publicKey;

        const signedTx = await wallet.signTransaction(tx);
        const sig = await this.connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 });
        await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log('single-tx init+deposit signature:', sig);

        return { fundId: fundPda.toString(), signature: sig };
      }

      // No initial deposit: just send initialize_fund as a single tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const initOnlyIx = await (program as any).methods
        .initializeFund(name, description, managementFeeBps, performanceFeeBps)
        .accounts({
          fund: fundPda,
          vault: vaultPda,
          sharesMint: sharesMintPda,
          baseMint: NATIVE_MINT,
          manager: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();
      const tx = new Transaction().add(initOnlyIx);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      const signed = await wallet.signTransaction(tx);
      const sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 });
      await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      console.log('initialize_fund signature:', sig);
      return { fundId: fundPda.toString(), signature: sig };
    } catch (error) {
      console.error('Error creating fund with program vault:', error);
      
      // Enhanced error handling
      if (error instanceof Error) {
        // Transform common simulation errors into actionable messages
        if (error.message.includes('already been processed')) {
          // Idempotency: probe if the fund account now exists; if yes, treat as success
          try {
            const program = await this.getProgram(wallet);
            const name = params.name.slice(0, 32);
            const [fundPda] = PublicKey.findProgramAddressSync(
              [Buffer.from('fund'), wallet.publicKey.toBuffer(), Buffer.from(name)],
              program.programId
            );
            const fundInfo = await this.connection.getAccountInfo(fundPda);
            if (fundInfo) {
              console.warn('Tx already processed; fund account exists. Returning success.');
              return { fundId: fundPda.toString(), signature: 'already-processed' };
            }
          } catch (probeErr) {
            console.warn('Idempotency probe failed after already-processed error:', probeErr);
          }
          throw new Error('This transaction was already processed. Please wait a moment and check if the fund was created, or try again with a fresh name.');
        }
        if (error.message.includes('already in use')) {
          throw new Error('Fund or related accounts already exist. Pick a different fund name or proceed with a deposit.');
        }
        if (error.message.includes('Blockhash not found')) {
          throw new Error('Transaction expired. Please try again with a fresh transaction.');
        }
        if (error.message.toLowerCase().includes('insufficient')) {
          throw new Error('Insufficient balance or rent-exemption. Please check your wallet balance.');
        }
      }
      
      throw error;
    }
  }

  // Add withdraw function for fund shares
  async withdrawFromFund(wallet: WalletContextState, fundId: string, sharePercentage: number): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Withdrawing', sharePercentage, '% from fund:', fundId);
      
      // TODO: Implement real withdrawal using the deployed program
      // This would calculate the user's share of the vault and transfer SOL back
      
      const signature = 'mock_withdraw_' + Date.now();
      console.log('Withdraw transaction:', signature);
      
      return signature;
    } catch (error) {
      console.error('Error withdrawing from fund:', error);
      throw error;
    }
  }

  async depositToFund(wallet: WalletContextState, fundId: string, amount: number): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Making REAL deposit of', amount, 'SOL to fund:', fundId);
      console.log('From wallet:', wallet.publicKey.toString());

      const program = await this.getProgram(wallet);

      // Use the fundId as the fund PDA and derive related PDAs
      const fundPda = new PublicKey(fundId);
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), fundPda.toBuffer()],
        program.programId
      );
      const [sharesMintPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('shares'), fundPda.toBuffer()],
        program.programId
      );
      const [investorPositionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), wallet.publicKey.toBuffer(), fundPda.toBuffer()],
        program.programId
      );

      // Amount in lamports
      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Ensure WSOL ATA and wrap SOL
      const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);
      const tx = new Transaction();
      const ataInfo = await this.connection.getAccountInfo(investorWsolAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            investorWsolAta,
            wallet.publicKey,
            NATIVE_MINT
          )
        );
      }
      tx.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: investorWsolAta,
          lamports: amountLamports,
        })
      );
      tx.add(createSyncNativeInstruction(investorWsolAta));

      // Investor shares ATA (will be created inside program if needed)
      const investorSharesAta = await getAssociatedTokenAddress(sharesMintPda, wallet.publicKey);

      // Build deposit instruction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const depositIx = await (program as any).methods
        .deposit(new BN(amountLamports))
        .accounts({
          fund: fundPda,
          vault: vaultPda,
          sharesMint: sharesMintPda,
          investorPosition: investorPositionPda,
          investorTokenAccount: investorWsolAta,
          investorSharesAccount: investorSharesAta,
          investor: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      tx.add(depositIx);

      // Send single transaction
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signed = await wallet.signTransaction(tx);
      let signature: string | null = null;
      try {
        signature = await this.connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'processed',
          maxRetries: 3,
        });
        await this.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        console.log('deposit signature:', signature);
        return signature;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Handle idempotent/duplicate submission by regenerating a fresh blockhash and retrying once
        if (msg.includes('already been processed')) {
          console.warn('Deposit tx reported as already processed during simulation; retrying with a fresh blockhash...');
          const fresh = await this.connection.getLatestBlockhash('finalized');
          tx.recentBlockhash = fresh.blockhash;
          tx.feePayer = wallet.publicKey;
          const reSigned = await wallet.signTransaction(tx);
          const retrySig = await this.connection.sendRawTransaction(reSigned.serialize(), {
            skipPreflight: true,
            preflightCommitment: 'processed',
            maxRetries: 3,
          });
          await this.connection.confirmTransaction({ signature: retrySig, blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight }, 'confirmed');
          console.log('deposit signature (retry):', retrySig);
          return retrySig;
        }
        throw e;
      }
    } catch (error) {
      console.error('Error making real deposit to program vault:', error);
      
      // Enhanced error handling
      if (error instanceof Error) {
        if (error.message.includes('already been processed')) {
          throw new Error('Transaction was just processed or duplicated. Please try again; we will automatically retry with a fresh blockhash if needed.');
        }
        if (error.message.includes('Blockhash not found')) {
          throw new Error('Transaction expired. Please try again.');
        }
        if (error.message.includes('insufficient funds') || error.message.toLowerCase().includes('insufficient')) {
          throw new Error('Insufficient SOL balance for this deposit (including rent).');
        }
      }
      
      throw error;
    }
  }

  // Manager pays fund investors from SOL vault, applying platform/performance fees on-chain
  async payFundInvestors(wallet: WalletContextState, fundId: string, totalAmountSol: number, investorWallets: string[]): Promise<string> {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const program = await this.getProgram(wallet);

    // Derive required PDAs
    const fundPda = new PublicKey(fundId);
    const [vaultSolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol'), fundPda.toBuffer()],
      program.programId
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), fundPda.toBuffer()],
      program.programId
    );
    // Temp WSOL account PDA used inside the instruction to unwrap WSOL -> SOL into vault_sol
    const [tempWsolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol_temp'), fundPda.toBuffer()],
      program.programId
    );

    // Build remaining accounts for WSOL fallback and SOL path:
    // - For each investor: [InvestorPosition PDA (ro), Investor system account (w), Investor WSOL ATA (w)]
    // - Append fee ATAs at the end: [Treasury WSOL ATA (w), Manager WSOL ATA (w)]
    const remainingAccounts: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] = [];

    // Pre-create any missing ATAs (investors, treasury, manager) so the CPI token::transfer succeeds
    const preIxs: Transaction['instructions'] = [];

    // Resolve treasury
    const treasuryPk = new PublicKey(
      process.env.NEXT_PUBLIC_TREASURY_WALLET ||
        process.env.TREASURY_WALLET ||
        '8NCLTHTiHJsgDoKyydY8vQfyi8RPDU4P59pCUHQGrBFm'
    );

    // Gather investor triples
    for (const w of investorWallets) {
      const investorPk = new PublicKey(w);
      const [positionPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('position'), investorPk.toBuffer(), fundPda.toBuffer()],
        program.programId
      );

      // Investor WSOL ATA
      const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, investorPk);
      const investorAtaInfo = await this.connection.getAccountInfo(investorWsolAta);
      if (!investorAtaInfo) {
        preIxs.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey, // payer
            investorWsolAta,
            investorPk, // owner
            NATIVE_MINT
          )
        );
      }

      // Push triple: position (ro), investor system (w), investor WSOL ATA (w)
      remainingAccounts.push({ pubkey: positionPda, isWritable: false, isSigner: false });
      remainingAccounts.push({ pubkey: investorPk, isWritable: true, isSigner: false });
      remainingAccounts.push({ pubkey: investorWsolAta, isWritable: true, isSigner: false });
    }

    // Fee recipient WSOL ATAs (append at the end)
    const treasuryWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, treasuryPk);
    const managerWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey);

    const [treasuryAtaInfo, managerAtaInfo] = await Promise.all([
      this.connection.getAccountInfo(treasuryWsolAta),
      this.connection.getAccountInfo(managerWsolAta),
    ]);
    if (!treasuryAtaInfo) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          treasuryWsolAta,
          treasuryPk,
          NATIVE_MINT
        )
      );
    }
    if (!managerAtaInfo) {
      preIxs.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          managerWsolAta,
          wallet.publicKey,
          NATIVE_MINT
        )
      );
    }

    remainingAccounts.push({ pubkey: treasuryWsolAta, isWritable: true, isSigner: false });
    remainingAccounts.push({ pubkey: managerWsolAta, isWritable: true, isSigner: false });

    const totalLamports = Math.floor(totalAmountSol * LAMPORTS_PER_SOL);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ix = await (program as any).methods
      .payFundInvestors(new BN(totalLamports))
      .accounts({
        manager: wallet.publicKey,
        fund: fundPda,
        vaultSolAccount: vaultSolPda,
        vault: vaultPda,
        baseMint: NATIVE_MINT,
        tempWsolAccount: tempWsolPda,
        treasury: treasuryPk,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();

    const tx = new Transaction();
    // Prepend ATA creations, then the program instruction
    for (const i of preIxs) tx.add(i);
    tx.add(ix);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    const signed = await wallet.signTransaction(tx);

    try {
      const sig = await this.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 });
      await this.connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      return sig;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('InstructionFallbackNotFound') || msg.includes('0x65')) {
        throw new Error('Program on devnet is missing pay_fund_investors. Please upgrade the managed_funds program at 3dHDaKpa5aLMwimWJeBihqwQyyHpR6ky7NNDPtv7QFYt and sync the IDL.');
      }
      if (msg.includes('already been processed')) {
        const fresh = await this.connection.getLatestBlockhash('finalized');
        tx.recentBlockhash = fresh.blockhash;
        tx.feePayer = wallet.publicKey;
        const reSigned = await wallet.signTransaction(tx);
        const retrySig = await this.connection.sendRawTransaction(reSigned.serialize(), { skipPreflight: true, preflightCommitment: 'processed', maxRetries: 3 });
        await this.connection.confirmTransaction({ signature: retrySig, blockhash: fresh.blockhash, lastValidBlockHeight: fresh.lastValidBlockHeight }, 'confirmed');
        return retrySig;
      }
      throw e;
    }
  }

  // Devnet-only helper: airdrop SOL into the fund's SOL vault PDA to allow payouts during testing
  async devnetTopUpVaultSol(fundId: string, amountSol = 1): Promise<string> {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '';
    if (!rpcUrl.includes('devnet')) {
      throw new Error('Airdrop is only available on devnet');
    }

    if (amountSol <= 0) throw new Error('Amount must be positive');

    // Derive vault SOL PDA using the IDL-loaded program ID
    const idl = await loadIdl();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const programId = new PublicKey(((idl as any).address ?? (idl as any).metadata?.address) || PROGRAM_ID);
    const fundPda = new PublicKey(fundId);
    const [vaultSolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol'), fundPda.toBuffer()],
      programId
    );

    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    const sig = await this.connection.requestAirdrop(vaultSolPda, lamports);
    // Confirm airdrop
    const latest = await this.connection.getLatestBlockhash('finalized');
    await this.connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
    return sig;
  }

  async getFund(fundId: string): Promise<SolanaFund | null> {
    try {
      // For now, return mock data since we need the wallet to access the program
      // In a real implementation, you'd fetch this from your backend API
      // which would fetch from Solana and store in MongoDB
      console.log('Fetching fund:', fundId);
      return null;
    } catch (error) {
      console.error('Error fetching fund:', error);
      return null;
    }
  }

  async getUserFunds(wallet: WalletContextState): Promise<SolanaFund[]> {
    if (!wallet.publicKey) {
      return [];
    }

    // This would typically fetch from your backend API
    // which maintains a mapping of funds and user positions
    return [];
  }

  // Generate PDA for fund account
  static generateFundPDA(manager: PublicKey, fundName: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('fund'), manager.toBuffer(), Buffer.from(fundName)],
      PROGRAM_ID
    );
  }
}

export const solanaFundService = new SolanaFundService();
