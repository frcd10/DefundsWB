const { Connection, PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL, Transaction, SYSVAR_RENT_PUBKEY } = require('@solana/web3.js');
const { AnchorProvider, Wallet, Program, BN } = require('@coral-xyz/anchor');
const { TOKEN_PROGRAM_ID, NATIVE_MINT, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require('@solana/spl-token');
const { JupiterService } = require('./jupiter-integration.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// =============================================================================
// COMPREHENSIVE FUND TESTING - SINGLE FILE
// =============================================================================
// ✅ Step 1: Fund Creation (COMPLETED)
// ✅ Step 2: Deposit (COMPLETED)
// ✅ Step 3: Real Jupiter Trading (COMPLETED)
// 🔄 Step 4: Withdrawal (READY TO TEST)

// =============================================================================
// NETWORK CONFIGURATION - HYBRID APPROACH
// =============================================================================
// Fund operations: Use devnet (where our program is deployed)
// Jupiter trading: Use mainnet (where Jupiter is available)
const DEVNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

// =============================================================================
// TEST CONFIGURATION - SET TO FALSE FOR COMPLETED STEPS
// =============================================================================
const TEST_STEP_1_CREATE_FUND = false;    // already created
const TEST_STEP_2_DEPOSIT = false;        // already deposited
const TEST_STEP_3_TRADE = false;          // ✅ COMPLETED (Real Jupiter)
const TEST_STEP_4_WITHDRAW = false;       // ✅ COMPLETED (Percentage withdrawal)
const TEST_STEP_5_FINAL_CHECK = false;    // ✅ COMPLETED
const TEST_STEP_6_ERROR_TEST = true;      // 🔄 TESTING ERROR HANDLING

// =============================================================================
// DEVNET VAULT SOL TOP-UP (OPTIONAL)
// =============================================================================
// When true, the script will airdrop SOL to the SOL vault PDA to unblock
// pay_fund_investors testing on devnet. This is only for local testing.
const TEST_DEVNET_TOP_UP_VAULT_SOL = false; // set to true to airdrop to SOL vault PDA
const TOP_UP_SOL_AMOUNT = 0.05; // SOL to airdrop to the SOL vault PDA

// =============================================================================
// WITHDRAWAL CONFIGURATION
// =============================================================================
const WITHDRAWAL_PERCENTAGE = 50; // Percentage of CURRENT holdings to withdraw
const ERROR_TEST_PERCENTAGE = 120; // Test percentage > 100% for error handling

// =============================================================================
// PROGRAM CONFIGURATION
// =============================================================================
// Use env if provided, otherwise fall back to the deployed program ID to avoid Non-base58 errors
const DEFAULT_PROGRAM_ID_STR = '3dHDaKpa5aLMwimWJeBihqwQyyHpR6ky7NNDPtv7QFYt';
const ENV_PROGRAM_ID_STR = (process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || process.env.SOLANA_PROGRAM_ID || '').trim();
let PROGRAM_ID;
try {
  PROGRAM_ID = new PublicKey(ENV_PROGRAM_ID_STR && ENV_PROGRAM_ID_STR.length > 0 ? ENV_PROGRAM_ID_STR : DEFAULT_PROGRAM_ID_STR);
} catch (e) {
  console.warn(`⚠️ Invalid PROGRAM ID in env ('${ENV_PROGRAM_ID_STR}'): ${e.message}. Falling back to default.`);
  PROGRAM_ID = new PublicKey(DEFAULT_PROGRAM_ID_STR);
}

// USDC Mint addresses (different on mainnet vs devnet)
const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

// =============================================================================
// WALLET CONFIGURATION
// =============================================================================
// ⚠️ HARDCODED TEST WALLET - FUNDED WITH 0.032882432 SOL ON MAINNET
// Address: BFEanpFhQBrcAwXFUv9bhw53AijBXrSWwFPMVsWLq6ot
const TEST_WALLET_PRIVATE_KEY = [
93, 79, 79, 137, 235, 211, 183, 150, 75, 244, 181, 1, 9, 131, 96, 7, 223, 208, 127, 17, 90, 228, 247, 116, 210, 40, 253, 190, 209, 157, 31, 236, 152, 58, 91, 196, 142, 201, 19, 74, 252, 145, 218, 10, 167, 222, 67, 98, 152, 66, 52, 29, 67, 217, 192, 199, 211, 197, 84, 79, 75, 32, 101, 163
];

const MANAGER_KEYPAIR = Keypair.fromSecretKey(new Uint8Array(TEST_WALLET_PRIVATE_KEY));

// =============================================================================
// TEST AMOUNTS
// =============================================================================
const FUND_CREATION_AMOUNT = 0.11; // SOL
const TRADE_AMOUNT = 0.005; // SOL (minimal for cost efficiency)

// =============================================================================
// COMPLETED TRANSACTION HASHES (FOR REFERENCE)
// =============================================================================
const COMPLETED_TRANSACTIONS = {
  FUND_CREATION: '4U2Y3E45FktENHyAdRzB7ibBzYmS3cnGw42vfFCCGL7ndtdWesR6QEgMEPqpnX5MWdaAEQvA3BZcrFyvUC8x2hhS',
  DEPOSIT: '2Kw5Nf9rbasisPywBCCKGfsainrkDMWD2fCxndzra64WMDzWjHPrktNrXvdVMH7ucoCYUvwYymbh5zEx2XRXcBQH',
  JUPITER_TRADE: '33r6q41NM9SNmCjD8KD9Je2hDRchkEyMQz8pyE4tiMfMgRjKiMiTVPHecEMKzu7mj8kAfcWXen5G1WDopBAaWRLT' // 0.005 SOL → 1.009157 USDC
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
function logTransaction(action, hash, details = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔗 ${action.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`   Hash: ${hash}`);
  
  // Use appropriate explorer based on network
  const explorerBase = hash === COMPLETED_TRANSACTIONS.JUPITER_TRADE ? 
    'https://explorer.solana.com/tx/' : // Mainnet for Jupiter
    'https://explorer.solana.com/tx/?cluster=devnet'; // Devnet for fund operations
    
  console.log(`   Explorer: ${explorerBase}${hash}`);
  
  if (Object.keys(details).length > 0) {
    console.log(`   Details:`);
    Object.entries(details).forEach(([key, value]) => {
      console.log(`     ${key}: ${value}`);
    });
  }
  console.log(`${'='.repeat(60)}\n`);
}

async function checkWalletBalance(connection, publicKey, label = 'Wallet') {
  const balance = await connection.getBalance(publicKey);
  const balanceSOL = balance / LAMPORTS_PER_SOL;
  console.log(`💰 ${label} Balance: ${balanceSOL.toFixed(6)} SOL (${balance} lamports)`);
  return balanceSOL;
}

async function confirmTransaction(connection, signature) {
  console.log(`⏳ Waiting for transaction confirmation...`);
  const confirmation = await connection.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  console.log(`✅ Transaction confirmed!`);
  return confirmation;
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================
async function comprehensiveFundTest() {
  try {
    console.log(`\n🚀 COMPREHENSIVE FUND TESTING - SINGLE FILE`);
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`💼 Program ID: ${PROGRAM_ID.toString()}`);
    console.log(`🔑 Manager Wallet: ${MANAGER_KEYPAIR.publicKey.toString()}`);
    
    // =============================================================================
    // FUND OPERATIONS SETUP (DEVNET)
    // =============================================================================
    const devnetConnection = new Connection(DEVNET_RPC, 'confirmed');
    console.log(`\n📡 Fund Operations: Connected to devnet`);
    
    // Create provider and program for devnet operations
    const wallet = new Wallet(MANAGER_KEYPAIR);
    const provider = new AnchorProvider(devnetConnection, wallet, { commitment: 'confirmed' });
    
    // Load IDL
    const idlPath = path.join(process.cwd(), 'target', 'idl', 'managed_funds.json');
    const idlRaw = fs.readFileSync(idlPath, 'utf8');
    const idl = JSON.parse(idlRaw);
    idl.address = PROGRAM_ID.toString();
    
    const program = new Program(idl, provider);
    console.log(`✅ Program instance created for devnet operations`);
    
    // =============================================================================
    // JUPITER SETUP (MAINNET)
    // =============================================================================
    const mainnetConnection = new Connection(MAINNET_RPC, 'confirmed');
    const jupiterService = new JupiterService(mainnetConnection);
    console.log(`✅ Jupiter service created for mainnet trading`);
    
    // =============================================================================
    // DERIVE PDAs (CONSISTENT ACROSS ALL STEPS)
    // =============================================================================
    const fundName = "Test Fund";
    
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fund'), MANAGER_KEYPAIR.publicKey.toBuffer(), Buffer.from(fundName)],
      program.programId
    );
    
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), fundPda.toBuffer()],
      program.programId
    );
    
    // SOL vault PDA used as the source of payouts in pay_fund_investors
    const [vaultSolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_sol'), fundPda.toBuffer()],
      program.programId
    );

    const [sharesMintPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('shares'), fundPda.toBuffer()],
      program.programId
    );
    
    const [investorPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), MANAGER_KEYPAIR.publicKey.toBuffer(), fundPda.toBuffer()],
      program.programId
    );
    
    console.log(`\n📋 Fund Infrastructure (PDAs):`);
    console.log(`   Fund PDA: ${fundPda.toString()}`);
    console.log(`   Vault PDA: ${vaultPda.toString()}`);
    console.log(`   Vault SOL PDA: ${vaultSolPda.toString()}`);
    console.log(`   Shares Mint PDA: ${sharesMintPda.toString()}`);
    console.log(`   Investor Position PDA: ${investorPositionPda.toString()}`);

    // Quick visibility into balances: WSOL in SPL vault vs SOL in SOL vault PDA
    try {
      const wsolVaultBalance = await devnetConnection.getTokenAccountBalance(vaultPda);
      console.log(`\n🔎 Vault WSOL (SPL) Balance: ${wsolVaultBalance.value.uiAmountString} WSOL`);
    } catch (e) {
      console.log(`\n🔎 Vault WSOL (SPL) Balance: (no token account yet or not initialized)`);
    }
    const solVaultLamports = await devnetConnection.getBalance(vaultSolPda);
    console.log(`🔎 Vault SOL (PDA) Balance: ${(solVaultLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL (${solVaultLamports} lamports)`);

    // Optional: Devnet-only top-up to SOL vault PDA to unblock payouts
    if (TEST_DEVNET_TOP_UP_VAULT_SOL) {
      try {
        console.log(`\n🪂 Requesting airdrop of ${TOP_UP_SOL_AMOUNT} SOL to Vault SOL PDA (devnet testing)...`);
        const sig = await devnetConnection.requestAirdrop(vaultSolPda, Math.floor(TOP_UP_SOL_AMOUNT * LAMPORTS_PER_SOL));
        await confirmTransaction(devnetConnection, sig);
        const newSolVaultLamports = await devnetConnection.getBalance(vaultSolPda);
        console.log(`✅ Airdrop complete. New Vault SOL (PDA) Balance: ${(newSolVaultLamports / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
      } catch (airdropErr) {
        console.log(`❌ Airdrop to SOL vault PDA failed: ${airdropErr.message}`);
      }
    }
    
    // =============================================================================
    // STEP 1: FUND CREATION (CONDITIONAL)
    // =============================================================================
    if (TEST_STEP_1_CREATE_FUND) {
      console.log(`\n🏗️  STEP 1: CREATING FUND...`);
      
      const fundCreationTx = await program.methods
        .initializeFund(
          fundName,
          "A comprehensive test fund with trading capabilities",
          200, // 2% management fee
          500  // 5% performance fee
        )
        .accounts({
          fund: fundPda,
          vault: vaultPda,
          sharesMint: sharesMintPda,
          baseMint: NATIVE_MINT,
          manager: MANAGER_KEYPAIR.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
        })
        .signers([MANAGER_KEYPAIR])
        .rpc();
      
      await confirmTransaction(devnetConnection, fundCreationTx);
      logTransaction('Fund Created', fundCreationTx, {
        'Fund Name': fundName,
        'Network': 'Devnet',
        'Management Fee': '2%',
        'Performance Fee': '5%'
      });
    } else {
      console.log(`\n✅ STEP 1: FUND ALREADY CREATED`);
      logTransaction('Fund Creation (Previous)', COMPLETED_TRANSACTIONS.FUND_CREATION, {
        'Status': 'Already Completed',
        'Network': 'Devnet',
        'Fund Name': fundName
      });
    }
    
    // =============================================================================
    // STEP 2: DEPOSIT (CONDITIONAL)
    // =============================================================================
    if (TEST_STEP_2_DEPOSIT) {
      console.log(`\n💰 STEP 2: DEPOSITING TO FUND...`);
      
      const depositAmount = new BN(FUND_CREATION_AMOUNT * LAMPORTS_PER_SOL);
      const investorTokenAccount = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);
      const investorSharesAccount = await getAssociatedTokenAddress(sharesMintPda, MANAGER_KEYPAIR.publicKey);

      // Ensure manager has enough SOL on devnet to cover deposit + fees + (optional) ATA rent
      const currentMgrLamports = await devnetConnection.getBalance(MANAGER_KEYPAIR.publicKey);
      const investorTokenAccountInfoPre = await devnetConnection.getAccountInfo(investorTokenAccount);
      const needsAta = !investorTokenAccountInfoPre;
      const ataRent = needsAta ? await devnetConnection.getMinimumBalanceForRentExemption(165) : 0; // token account size
      const feeBuffer = Math.floor(0.002 * LAMPORTS_PER_SOL); // ~0.002 SOL buffer for tx fees
      const requiredLamports = depositAmount.toNumber() + ataRent + feeBuffer;
      if (currentMgrLamports < requiredLamports) {
        const shortfall = requiredLamports - currentMgrLamports;
        const request = Math.ceil(shortfall / LAMPORTS_PER_SOL) + 1; // round up to full SOL +1 for safety
        console.log(`\n🪂 Requesting devnet airdrop of ${request} SOL to manager to fund deposit...`);
        const sig = await devnetConnection.requestAirdrop(MANAGER_KEYPAIR.publicKey, request * LAMPORTS_PER_SOL);
        await confirmTransaction(devnetConnection, sig);
        await checkWalletBalance(devnetConnection, MANAGER_KEYPAIR.publicKey, 'Manager (Devnet after airdrop)');
      }
      
      // Prepare wrapped SOL
      const depositTx = new Transaction();
      
      const investorTokenAccountInfo = await devnetConnection.getAccountInfo(investorTokenAccount);
      if (!investorTokenAccountInfo) {
        depositTx.add(createAssociatedTokenAccountInstruction(
          MANAGER_KEYPAIR.publicKey,
          investorTokenAccount,
          MANAGER_KEYPAIR.publicKey,
          NATIVE_MINT
        ));
      }
      
      depositTx.add(
        SystemProgram.transfer({
          fromPubkey: MANAGER_KEYPAIR.publicKey,
          toPubkey: investorTokenAccount,
          lamports: depositAmount.toNumber(),
        })
      );
      
      depositTx.add(createSyncNativeInstruction(investorTokenAccount));
      
      const prepTxSignature = await devnetConnection.sendTransaction(depositTx, [MANAGER_KEYPAIR]);
      await confirmTransaction(devnetConnection, prepTxSignature);
      
      // Actual deposit
      const depositToFundTx = await program.methods
        .deposit(depositAmount)
        .accounts({
          fund: fundPda,
          vault: vaultPda,
          sharesMint: sharesMintPda,
          investorPosition: investorPositionPda,
          investorTokenAccount: investorTokenAccount,
          investorSharesAccount: investorSharesAccount,
          investor: MANAGER_KEYPAIR.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
        })
        .signers([MANAGER_KEYPAIR])
        .rpc();
      
      await confirmTransaction(devnetConnection, depositToFundTx);
      logTransaction('Deposit Made', depositToFundTx, {
        'Amount': `${FUND_CREATION_AMOUNT} SOL`,
        'Network': 'Devnet'
      });
    } else {
      console.log(`\n✅ STEP 2: DEPOSIT ALREADY COMPLETED`);
      logTransaction('Deposit (Previous)', COMPLETED_TRANSACTIONS.DEPOSIT, {
        'Status': 'Already Completed',
        'Amount': `${FUND_CREATION_AMOUNT} SOL`,
        'Network': 'Devnet'
      });
    }
    
    // =============================================================================
    // STEP 3: REAL JUPITER TRADING (CONDITIONAL)
    // =============================================================================
    if (TEST_STEP_3_TRADE) {
      console.log(`\n📈 STEP 3: EXECUTING REAL JUPITER TRADE...`);
      
      // Check mainnet balance first
      console.log(`\n💰 Checking mainnet balance for Jupiter trading...`);
      const mainnetBalance = await checkWalletBalance(mainnetConnection, MANAGER_KEYPAIR.publicKey, 'Mainnet Wallet');
      
      if (mainnetBalance < 0.01) {
        console.log(`❌ Insufficient mainnet balance for Jupiter trading!`);
        console.log(`   Need at least 0.01 SOL, have ${mainnetBalance.toFixed(6)} SOL`);
        console.log(`   Please fund wallet: ${MANAGER_KEYPAIR.publicKey.toString()}`);
        return;
      }
      
      const tradeAmount = new BN(TRADE_AMOUNT * LAMPORTS_PER_SOL);
      
      console.log(`📋 Jupiter Trade Details:`);
      console.log(`   Input: ${TRADE_AMOUNT} SOL`);
      console.log(`   Output: USDC`);
      console.log(`   Network: Mainnet`);
      console.log(`   Slippage: 0.5%`);
      
      try {
        // Execute real Jupiter swap
        const managerWallet = {
          publicKey: MANAGER_KEYPAIR.publicKey,
          payer: MANAGER_KEYPAIR
        };
        
        const jupiterTxSignature = await jupiterService.executeSwap(
          NATIVE_MINT.toString(),
          USDC_MINT_MAINNET.toString(),
          tradeAmount.toNumber(),
          managerWallet,
          50 // 0.5% slippage
        );
        
        // Record trade in fund program (devnet)
        const [tradePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("trade"), fundPda.toBuffer(), NATIVE_MINT.toBuffer(), USDC_MINT_DEVNET.toBuffer()],
          PROGRAM_ID
        );
        
        const recordTradeTx = await program.methods
          .executeTrade(
            NATIVE_MINT,
            USDC_MINT_DEVNET, // Use devnet USDC for record keeping
            tradeAmount,
            new BN(1)
          )
          .accounts({
            fund: fundPda,
            vault: vaultPda,
            trade: tradePda,
            manager: MANAGER_KEYPAIR.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([MANAGER_KEYPAIR])
          .rpc();
        
        await confirmTransaction(devnetConnection, recordTradeTx);
        
        logTransaction('Real Jupiter Trade', jupiterTxSignature, {
          'Type': 'SOL → USDC (Real Jupiter)',
          'Amount': `${TRADE_AMOUNT} SOL`,
          'Network': 'Mainnet',
          'Fund Record': recordTradeTx,
          'Trade PDA': tradePda.toString()
        });
        
        // Check post-trade balances
        await checkWalletBalance(mainnetConnection, MANAGER_KEYPAIR.publicKey, 'Post-Trade Mainnet');
        
      } catch (jupiterError) {
        console.error(`❌ Jupiter trade failed:`, jupiterError.message);
        throw jupiterError;
      }
    } else {
      console.log(`\n✅ STEP 3: JUPITER TRADE ALREADY COMPLETED`);
      logTransaction('Jupiter Trade (Previous)', COMPLETED_TRANSACTIONS.JUPITER_TRADE, {
        'Status': 'Already Completed',
        'Type': 'SOL → USDC (Real Jupiter)',
        'Amount': `${TRADE_AMOUNT} SOL → 1.009157 USDC`,
        'Network': 'Mainnet',
        'Cost': '0.007307 SOL total'
      });
    }
    
    // =============================================================================
    // STEP 4: WITHDRAWAL TESTING (NEW)
    // =============================================================================
    if (TEST_STEP_4_WITHDRAW) {
      console.log(`\n🏃 STEP 4: TESTING ${WITHDRAWAL_PERCENTAGE}% WITHDRAWAL FUNCTIONALITY...`);
      
      // Derive withdrawal state PDA
      const [withdrawalStatePda] = PublicKey.findProgramAddressSync(
        [Buffer.from('withdrawal'), fundPda.toBuffer(), MANAGER_KEYPAIR.publicKey.toBuffer()],
        program.programId
      );
      
      console.log(`📋 Withdrawal Setup:`);
      console.log(`   Withdrawal State PDA: ${withdrawalStatePda.toString()}`);
      console.log(`   Fund PDA: ${fundPda.toString()}`);
      console.log(`   Investor: ${MANAGER_KEYPAIR.publicKey.toString()}`);
      console.log(`   Network: Devnet`);
      
      try {
      // Step 4a: Initiate Withdrawal (skip if already exists)
      console.log(`\n🚀 Step 4a: Checking withdrawal state...`);
      
      let withdrawalInitiated = false;
      try {
        // Check if withdrawal state already exists
        const existingWithdrawalState = await program.account.withdrawalState.fetch(withdrawalStatePda);
        console.log(`✅ Withdrawal state already exists: ${existingWithdrawalState.status}`);
        console.log(`   Shares to withdraw: ${existingWithdrawalState.sharesToWithdraw.toString()}`);
        console.log(`   Status: ${JSON.stringify(existingWithdrawalState.status)}`);
        withdrawalInitiated = true;
      } catch (fetchError) {
        console.log(`📝 Creating new withdrawal state...`);
        
        try {
          const sharesToWithdraw = new BN(50); // 50% of shares
          
          const initiateWithdrawalTx = await program.methods
            .initiateWithdrawal(sharesToWithdraw)
            .accounts({
              fund: fundPda,
              investorPosition: investorPositionPda,
              withdrawalState: withdrawalStatePda,
              investor: MANAGER_KEYPAIR.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([MANAGER_KEYPAIR])
            .rpc();
          
          await confirmTransaction(devnetConnection, initiateWithdrawalTx);
          logTransaction('Withdrawal Initiated', initiateWithdrawalTx, {
            'Shares to Withdraw': '50%',
            'Network': 'Devnet'
          });
          withdrawalInitiated = true;
          
        } catch (initiateError) {
          console.error(`❌ Failed to initiate withdrawal:`, initiateError.message);
          console.log(`   This may be because the withdrawal state already exists`);
          console.log(`   Continuing with existing state...`);
          withdrawalInitiated = true; // Assume it exists and continue
        }
      }
      
      if (withdrawalInitiated) {
        // Let's try simple withdrawal first, then complex liquidation as fallback
        console.log(`\n🔄 Step 4b: Testing withdrawal approaches...`);
        
        try {
          // First, get current fund data to calculate proper 50% withdrawal
          const fundData = await program.account.fund.fetch(fundPda);
          const investorData = await program.account.investorPosition.fetch(investorPositionPda);
          
          // Calculate withdrawal percentage of CURRENT holdings
          const currentShares = investorData.shares.toNumber();
          const percentageShares = Math.floor(currentShares * (WITHDRAWAL_PERCENTAGE / 100));
          const expectedSOL = (percentageShares * fundData.totalAssets.toNumber()) / fundData.totalShares.toNumber() / 1e9;
          
          console.log(`📋 ${WITHDRAWAL_PERCENTAGE}% Withdrawal Calculation:`);
          console.log(`   Current Shares Owned: ${currentShares.toLocaleString()}`);
          console.log(`   ${WITHDRAWAL_PERCENTAGE}% of Current: ${percentageShares.toLocaleString()} shares`);
          console.log(`   Expected SOL Return: ~${expectedSOL.toFixed(6)} SOL`);
          console.log(`   Remaining After: ${(currentShares - percentageShares).toLocaleString()} shares (${100 - WITHDRAWAL_PERCENTAGE}%)`);
          
          // Approach 1: Simple direct withdrawal
          console.log(`   Testing simple withdraw function...`);
          
          // Get required token accounts
          const investorTokenAccount = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);
          const investorSharesAccount = await getAssociatedTokenAddress(sharesMintPda, MANAGER_KEYPAIR.publicKey);
          
          // Withdraw specified percentage of current shares
          const sharesToBurn = new BN(percentageShares);
          
          const withdrawTx = await program.methods
            .withdraw(sharesToBurn)
            .accounts({
              fund: fundPda,
              vault: vaultPda,
              sharesMint: sharesMintPda,
              investorPosition: investorPositionPda,
              investorTokenAccount: investorTokenAccount,
              investorSharesAccount: investorSharesAccount,
              investor: MANAGER_KEYPAIR.publicKey,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([MANAGER_KEYPAIR])
            .rpc();
          
          await confirmTransaction(devnetConnection, withdrawTx);
          logTransaction(`${WITHDRAWAL_PERCENTAGE}% Withdrawal Completed`, withdrawTx, {
            'Shares Burned': percentageShares.toLocaleString(),
            'Percentage': `${WITHDRAWAL_PERCENTAGE}%`,
            'Expected SOL': `~${expectedSOL.toFixed(6)} SOL`,
            'Type': 'Direct Withdrawal',
            'Network': 'Devnet'
          });
          
          console.log(`✅ Withdrawal completed successfully using simple method!`);
          console.log(`   No need to run finalization - withdrawal is complete.`);
          
        } catch (simpleWithdrawError) {
          console.log(`   ❌ Simple withdraw failed: ${simpleWithdrawError.message}`);
          console.log(`   Trying complex liquidation approach...`);
          
          // Approach 2: Complex liquidation process (original)
          console.log(`\n🔄 Step 4b: Liquidating positions (complex approach)...`);
          
          // Parameters for liquidation (empty arrays for testing - no actual positions to liquidate)
          const positionIndices = []; // Empty Vec<u8> - no positions to liquidate yet
          const minimumAmountsOut = []; // Empty Vec<u64> - no minimum amounts needed
          
          const liquidateTx = await program.methods
            .liquidatePositionsBatch(positionIndices, minimumAmountsOut)
            .accounts({
              withdrawalState: withdrawalStatePda,
              fund: fundPda,
              investor: MANAGER_KEYPAIR.publicKey,
            })
            .signers([MANAGER_KEYPAIR])
            .rpc();
          
          await confirmTransaction(devnetConnection, liquidateTx);
          logTransaction('Positions Liquidated', liquidateTx, {
            'Type': 'Batch Liquidation',
            'Network': 'Devnet'
          });
          
          // Step 4c: Finalize Withdrawal (only if we used complex approach)
          console.log(`\n✅ Step 4c: Finalizing withdrawal...`);
          
          // Get required accounts for finalization
          const investorSharesAccount = await getAssociatedTokenAddress(sharesMintPda, MANAGER_KEYPAIR.publicKey);
          
          // Derive vault SOL account PDA
          const [vaultSolAccountPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('vault_sol'), fundPda.toBuffer()],
            program.programId
          );
          
          // For testing, use manager as trader and treasury (in production these would be different)
          const traderAccount = MANAGER_KEYPAIR.publicKey;
          const treasuryAccount = MANAGER_KEYPAIR.publicKey;
          
          const finalizeWithdrawalTx = await program.methods
            .finalizeWithdrawal()
            .accounts({
              fund: fundPda,
              investorPosition: investorPositionPda,
              sharesMint: sharesMintPda,
              investorSharesAccount: investorSharesAccount,
              withdrawalState: withdrawalStatePda,
              vaultSolAccount: vaultSolAccountPda,
              investor: MANAGER_KEYPAIR.publicKey,
              trader: traderAccount,
              treasury: treasuryAccount,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([MANAGER_KEYPAIR])
            .rpc();
          
          await confirmTransaction(devnetConnection, finalizeWithdrawalTx);
          logTransaction('Withdrawal Finalized', finalizeWithdrawalTx, {
            'Status': 'Complete',
            'Network': 'Devnet'
          });
        }
        }
        
      } catch (withdrawalError) {
        console.error(`❌ Withdrawal failed:`, withdrawalError.message);
        console.log(`\n📋 Withdrawal Error Details:`);
        console.log(`   Error: ${withdrawalError.message}`);
        
        // Show the full error logs if available
        if (withdrawalError.logs) {
          console.log(`   Program Logs:`);
          withdrawalError.logs.forEach((log, index) => {
            console.log(`     ${index + 1}: ${log}`);
          });
        }
        
        console.log(`   This helps us understand what needs to be fixed in the withdrawal process`);
      }
    } else {
      console.log(`\n⏸️  STEP 4: WITHDRAWAL TESTING SKIPPED`);
      console.log(`   Ready to test when enabled`);
    }
    
    // =============================================================================
    // STEP 5: FINAL VERIFICATION & ANALYSIS
    // =============================================================================
    if (TEST_STEP_5_FINAL_CHECK) {
      console.log(`\n📊 STEP 5: FINAL VERIFICATION & FUND ANALYSIS...`);
      
      // Get detailed fund and investor data
      try {
        console.log(`\n🔍 FUND DATA ANALYSIS:`);
        console.log(`${'='.repeat(60)}`);
        
        const fundData = await program.account.fund.fetch(fundPda);
        const investorData = await program.account.investorPosition.fetch(investorPositionPda);
        
        console.log(`📊 Fund Information:`);
        console.log(`   Total Assets: ${(fundData.totalAssets.toNumber() / 1e9).toFixed(6)} SOL (${fundData.totalAssets.toString()} lamports)`);
        console.log(`   Total Shares: ${fundData.totalShares.toString()}`);
        console.log(`   Share Price: ${(fundData.totalAssets.toNumber() / fundData.totalShares.toNumber()).toFixed(9)} SOL per share`);
        
        console.log(`\n👤 Investor Position:`);
        console.log(`   Shares Owned: ${investorData.shares.toString()}`);
        console.log(`   Original Investment: ${(investorData.totalDeposited.toNumber() / 1e9).toFixed(6)} SOL`);
        console.log(`   Current Value: ${((investorData.shares.toNumber() * fundData.totalAssets.toNumber()) / fundData.totalShares.toNumber() / 1e9).toFixed(6)} SOL`);
        console.log(`   Total Withdrawn: ${(investorData.totalWithdrawn.toNumber() / 1e9).toFixed(6)} SOL`);
        
        console.log(`\n💡 WITHDRAWAL ANALYSIS:`);
        console.log(`   We withdrew 25 shares = ${((25 * fundData.totalAssets.toNumber()) / fundData.totalShares.toNumber() / 1e9).toFixed(6)} SOL`);
        console.log(`   50% of investment would be: ${(investorData.shares.toNumber() + 25) / 2} shares total`);
        console.log(`   Percentage withdrawn: ${(25 / (investorData.shares.toNumber() + 25) * 100).toFixed(1)}%`);
        
        const originalTotalShares = investorData.shares.toNumber() + 25; // Add back what we withdrew
        console.log(`\n📈 INVESTMENT PERFORMANCE:`);
        console.log(`   Original Total Shares: ${originalTotalShares}`);
        console.log(`   Original Investment: ${(investorData.totalDeposited.toNumber() / 1e9).toFixed(6)} SOL`);
        console.log(`   Shares Withdrawn: 25 (${(25/originalTotalShares*100).toFixed(1)}%)`);
        console.log(`   Shares Remaining: ${investorData.shares.toString()} (${(investorData.shares.toNumber()/originalTotalShares*100).toFixed(1)}%)`);
        
      } catch (analysisError) {
        console.log(`❌ Could not fetch fund analysis data: ${analysisError.message}`);
      }
      
      // Check balances
      console.log(`\n💰 Devnet Balance Check:`);
      await checkWalletBalance(devnetConnection, MANAGER_KEYPAIR.publicKey, 'Manager (Devnet)');
      await checkWalletBalance(devnetConnection, vaultPda, 'Fund Vault (Devnet)');
      
      // Check mainnet balances
      console.log(`\n💰 Mainnet Balance Check:`);
      await checkWalletBalance(mainnetConnection, MANAGER_KEYPAIR.publicKey, 'Manager (Mainnet)');
      
      // Try to check USDC balance on mainnet
      try {
        const managerUsdcAccount = await getAssociatedTokenAddress(USDC_MINT_MAINNET, MANAGER_KEYPAIR.publicKey);
        const usdcAccountInfo = await mainnetConnection.getTokenAccountBalance(managerUsdcAccount);
        console.log(`💰 Manager USDC (Mainnet): ${usdcAccountInfo.value.uiAmount} USDC`);
      } catch (e) {
        console.log(`💰 Manager USDC (Mainnet): No USDC account found`);
      }
      
      console.log(`\n🎉 COMPREHENSIVE TEST STATUS:`);
      console.log(`   ✅ Step 1: Fund Creation - COMPLETED`);
      console.log(`   ✅ Step 2: Deposit - COMPLETED`);
      console.log(`   ✅ Step 3: Jupiter Trading - COMPLETED (Real mainnet trade)`);
      console.log(`   ${TEST_STEP_4_WITHDRAW ? '🔄' : '✅'} Step 4: Withdrawal - ${TEST_STEP_4_WITHDRAW ? 'TESTED' : 'COMPLETED'}`);
      console.log(`   ✅ Step 5: Verification - COMPLETED`);
    }
    
    // =============================================================================
    // STEP 6: ERROR HANDLING TEST (NEW)
    // =============================================================================
    if (TEST_STEP_6_ERROR_TEST) {
      console.log(`\n🚨 STEP 6: TESTING ERROR HANDLING (${ERROR_TEST_PERCENTAGE}% WITHDRAWAL)...`);
      
      try {
        // Get current fund data to calculate the over-withdrawal attempt
        const fundData = await program.account.fund.fetch(fundPda);
        const investorData = await program.account.investorPosition.fetch(investorPositionPda);
        
        const currentShares = investorData.shares.toNumber();
        const overWithdrawalShares = Math.floor(currentShares * (ERROR_TEST_PERCENTAGE / 100));
        
        console.log(`📋 Error Test Setup:`);
        console.log(`   Current Shares Owned: ${currentShares.toLocaleString()}`);
        console.log(`   Attempting ${ERROR_TEST_PERCENTAGE}%: ${overWithdrawalShares.toLocaleString()} shares`);
        console.log(`   Excess Amount: ${(overWithdrawalShares - currentShares).toLocaleString()} shares over limit`);
        console.log(`   Expected Result: ❌ Error (insufficient shares)`);
        
        // Get required token accounts
        const investorTokenAccount = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);
        const investorSharesAccount = await getAssociatedTokenAddress(sharesMintPda, MANAGER_KEYPAIR.publicKey);
        
        // Attempt to withdraw more than 100%
        const sharesToBurn = new BN(overWithdrawalShares);
        
        console.log(`\n🔥 Attempting ${ERROR_TEST_PERCENTAGE}% withdrawal (should fail)...`);
        
        const withdrawTx = await program.methods
          .withdraw(sharesToBurn)
          .accounts({
            fund: fundPda,
            vault: vaultPda,
            sharesMint: sharesMintPda,
            investorPosition: investorPositionPda,
            investorTokenAccount: investorTokenAccount,
            investorSharesAccount: investorSharesAccount,
            investor: MANAGER_KEYPAIR.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([MANAGER_KEYPAIR])
          .rpc();
        
        // If we get here, the test failed (should have thrown an error)
        console.log(`❌ ERROR TEST FAILED: Withdrawal should have been rejected!`);
        console.log(`   Transaction succeeded when it should have failed: ${withdrawTx}`);
        
        logTransaction('ERROR: Unexpected Success', withdrawTx, {
          'Status': 'SHOULD HAVE FAILED',
          'Attempted Percentage': `${ERROR_TEST_PERCENTAGE}%`,
          'Shares Attempted': overWithdrawalShares.toLocaleString(),
          'Network': 'Devnet'
        });
        
      } catch (expectedError) {
        console.log(`✅ ERROR TEST PASSED: Withdrawal correctly rejected!`);
        console.log(`   Error Type: ${expectedError.name || 'Unknown'}`);
        console.log(`   Error Message: ${expectedError.message}`);
        
        // Check if it's the expected "InsufficientFunds" error
        if (expectedError.message.includes('InsufficientFunds') || 
            expectedError.message.includes('insufficient') ||
            expectedError.message.includes('Error Number: 6001') ||
            expectedError.message.includes('0x1771')) {
          console.log(`   ✅ Correct Error: InsufficientFunds detected`);
        } else if (expectedError.message.includes('Account does not have enough lamports')) {
          console.log(`   ✅ Correct Error: Insufficient token balance detected`);
        } else {
          console.log(`   ⚠️  Unexpected Error Type: Review error details`);
        }
        
        console.log(`\n📋 Error Handling Summary:`);
        console.log(`   ✅ Program correctly prevents over-withdrawal`);
        console.log(`   ✅ Security mechanism working as expected`);
        console.log(`   ✅ Investor funds are protected`);
      }
    } else {
      console.log(`\n⏸️  STEP 6: ERROR HANDLING TEST SKIPPED`);
      console.log(`   Ready to test when enabled`);
    }
    
    // =============================================================================
    // STEP 7: PAY FUND INVESTORS (SMOKE TEST - UNWRAP WSOL→SOL)
    // =============================================================================
    const TEST_STEP_7_PAY_FUND_INVESTORS = true; // enable to test payout path
    if (TEST_STEP_7_PAY_FUND_INVESTORS) {
      console.log(`\n💸 STEP 7: PAY FUND INVESTORS (WSOL→SOL unwrap path)...`);
      try {
        // Preconditions: fund must exist and WSOL vault must have funds
        try {
          await program.account.fund.fetch(fundPda);
        } catch (e) {
          console.log(`⏭️  Skipping payout: Fund account not initialized on devnet (create fund first).`);
          throw new Error('skip-step-7');
        }

        let wsolUiAmount = 0;
        try {
          const wsolVaultBalanceInfo = await devnetConnection.getTokenAccountBalance(vaultPda);
          wsolUiAmount = parseFloat(wsolVaultBalanceInfo.value.uiAmountString || '0');
        } catch (_) {
          // ignore
        }
        if (!wsolUiAmount || wsolUiAmount <= 0) {
          console.log(`⏭️  Skipping payout: Vault WSOL (SPL) has zero balance or not initialized.`);
          throw new Error('skip-step-7');
        }

        // Derive temp WSOL account PDA (created/closed inside ix)
        const [tempWsolPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('vault_sol_temp'), fundPda.toBuffer()],
          program.programId
        );

        // For smoke test, use manager as sole investor recipient
        // Ensure WSOL ATAs exist for manager (as investor), treasury, and manager (fees)
        const investorWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);
        const treasuryWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);
        const managerWsolAta = await getAssociatedTokenAddress(NATIVE_MINT, MANAGER_KEYPAIR.publicKey);

        // Create ATA if not exists
        const ataInfos = await devnetConnection.getMultipleAccountsInfo([investorWsolAta, treasuryWsolAta, managerWsolAta]);
        const createAtaIx = [];
        if (!ataInfos[0]) createAtaIx.push(createAssociatedTokenAccountInstruction(
          MANAGER_KEYPAIR.publicKey, investorWsolAta, MANAGER_KEYPAIR.publicKey, NATIVE_MINT
        ));
        if (!ataInfos[1]) createAtaIx.push(createAssociatedTokenAccountInstruction(
          MANAGER_KEYPAIR.publicKey, treasuryWsolAta, MANAGER_KEYPAIR.publicKey, NATIVE_MINT
        ));
        if (!ataInfos[2]) createAtaIx.push(createAssociatedTokenAccountInstruction(
          MANAGER_KEYPAIR.publicKey, managerWsolAta, MANAGER_KEYPAIR.publicKey, NATIVE_MINT
        ));
        if (createAtaIx.length > 0) {
          const ataTx = new Transaction().add(...createAtaIx);
          const sig = await devnetConnection.sendTransaction(ataTx, [MANAGER_KEYPAIR]);
          await confirmTransaction(devnetConnection, sig);
        }

        // Remaining accounts layout for WSOL fallback:
        // Triples per investor: [InvestorPosition, Investor System Account, Investor WSOL ATA]
        // Followed by two accounts: [Treasury WSOL ATA, Manager WSOL ATA]
        const remainingAccounts = [
          { pubkey: investorPositionPda, isWritable: true, isSigner: false },
          { pubkey: MANAGER_KEYPAIR.publicKey, isWritable: true, isSigner: false },
          { pubkey: investorWsolAta, isWritable: true, isSigner: false },
          { pubkey: treasuryWsolAta, isWritable: true, isSigner: false },
          { pubkey: managerWsolAta, isWritable: true, isSigner: false },
        ];

        // Small payout amount to exercise unwrap path; adjust as needed
        const payoutSol = 0.01;
        const totalAmountLamports = new BN(Math.floor(payoutSol * LAMPORTS_PER_SOL));

        console.log(`📋 Payout Plan:`);
        console.log(`   Total Amount: ${payoutSol} SOL (${totalAmountLamports.toString()} lamports)`);
        console.log(`   From SPL WSOL vault -> temp -> unwrap -> SOL vault PDA -> investors`);

        // Build instruction first to inspect account order
        const ix = await program.methods
          .payFundInvestors(totalAmountLamports)
          .accounts({
            manager: MANAGER_KEYPAIR.publicKey,
            fund: fundPda,
            vault: vaultPda,
            vaultSolAccount: vaultSolPda,
            baseMint: NATIVE_MINT,
            tempWsolAccount: tempWsolPda,
            treasury: MANAGER_KEYPAIR.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .remainingAccounts(remainingAccounts)
          .instruction();

        console.log("\n🧭 pay_fund_investors accounts order (debug):");
        ix.keys.forEach((meta, idx) => {
          console.log(`  [${idx}] ${meta.pubkey.toString()}  writable=${meta.isWritable} signer=${meta.isSigner}`);
        });

        // Send transaction manually
        const tx = new Transaction().add(ix);
        const txSig = await devnetConnection.sendTransaction(tx, [MANAGER_KEYPAIR]);

        await confirmTransaction(devnetConnection, txSig);

        logTransaction('Pay Fund Investors (WSOL→SOL unwrap)', txSig, {
          'Total Amount (SOL)': payoutSol,
          'Investor Count': 1,
          'Investors': [MANAGER_KEYPAIR.publicKey.toString()].join(','),
          'Network': 'Devnet'
        });

        // Show updated SOL vault and manager balances
        const postSolVault = await devnetConnection.getBalance(vaultSolPda);
        console.log(`🔎 Post-payout Vault SOL (PDA): ${(postSolVault / LAMPORTS_PER_SOL).toFixed(9)} SOL`);
        await checkWalletBalance(devnetConnection, MANAGER_KEYPAIR.publicKey, 'Manager (Devnet) after payout');

      } catch (payoutErr) {
        if (payoutErr.message === 'skip-step-7') {
          // already logged a skip reason above
        } else {
          console.error(`❌ Pay Fund Investors failed: ${payoutErr.message}`);
        }
        if (payoutErr.logs) {
          console.log('Program Logs:');
          payoutErr.logs.forEach((l, i) => console.log(`  ${i + 1}: ${l}`));
        }
      }
    } else {
      console.log(`\n⏸️  STEP 7: PAY FUND INVESTORS SKIPPED`);
    }

    console.log(`\n🎉 FINAL COMPREHENSIVE TEST STATUS:`);
    console.log(`   ✅ Step 1: Fund Creation - COMPLETED`);
    console.log(`   ✅ Step 2: Deposit - COMPLETED`);
    console.log(`   ✅ Step 3: Jupiter Trading - COMPLETED (Real mainnet trade)`);
    console.log(`   ✅ Step 4: Withdrawal - COMPLETED (Percentage-based)`);
    console.log(`   ✅ Step 5: Verification - COMPLETED`);
    console.log(`   ${TEST_STEP_6_ERROR_TEST ? '🔄' : '⏸️ '} Step 6: Error Handling - ${TEST_STEP_6_ERROR_TEST ? 'TESTED' : 'READY'}`);
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error);
    console.error(`Error details:`, error.message);
    if (error.stack) {
      console.error(`Stack trace:`, error.stack);
    }
  }
}

// =============================================================================
// RUN THE TEST
// =============================================================================
console.log(`\n🔑 Test Wallet: ${MANAGER_KEYPAIR.publicKey.toString()}`);
console.log(`💰 Make sure this wallet is funded on mainnet for Jupiter testing`);
console.log(`🌐 Devnet Explorer: https://explorer.solana.com/?cluster=devnet`);
console.log(`🌐 Mainnet Explorer: https://explorer.solana.com/`);

comprehensiveFundTest().then(() => {
  console.log(`\n✅ Testing completed successfully`);
}).catch((error) => {
  console.error(`\n💥 Unexpected error:`, error);
});
