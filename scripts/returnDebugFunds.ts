#!/usr/bin/env tsx
/**
 * Local debug script to return WSOL from specific test accounts back to 7Cx wallet
 * Usage: npx tsx scripts/returnDebugFunds.ts
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, NATIVE_MINT, createTransferInstruction, createCloseAccountInstruction, getAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || 'https://api.mainnet-beta.solana.com';
const DESTINATION_WALLET = '7CxGJGveQAtrFuZSawWGCmSZQt1VTTjNDz5zxKbybGYR';

// The specific accounts from your transaction that hold WSOL
const ACCOUNTS_TO_DRAIN = [
  '99c9jpi48swS5SLvT8wN9LPokrcVmgZ5R41uSuo1oRML', // Fund PDA with 0.01 WSOL
  'GmvLEAhM97T9AkridswySU3ATgvbnxGwMmUFTwJ9vZDm', // Vault token account with 0.01 WSOL
];

async function loadWallet() {
  // Try to load keypair from various common locations
  const possiblePaths = [
    path.join(process.env.HOME || '', '.config/solana/id.json'),
    path.join(process.cwd(), 'target/deploy/managed_funds-keypair.json'),
    path.join(process.cwd(), '7cx-keypair.json'), // if you have it locally
  ];
  
  for (const keypairPath of possiblePaths) {
    try {
      if (fs.existsSync(keypairPath)) {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
        const { Keypair } = await import('@solana/web3.js');
        return Keypair.fromSecretKey(new Uint8Array(keypairData));
      }
    } catch (e) {
      // continue trying
    }
  }
  
  console.log('⚠️  No keypair found. Please ensure you have access to the 7Cx wallet keypair.');
  console.log('   Expected locations:', possiblePaths);
  process.exit(1);
}

async function main() {
  console.log('🔧 Debug Fund Recovery Script');
  console.log('📡 RPC:', RPC_URL);
  console.log('🎯 Destination:', DESTINATION_WALLET);
  
  const connection = new Connection(RPC_URL, 'confirmed');
  const destinationPubkey = new PublicKey(DESTINATION_WALLET);
  
  // Load wallet (this script assumes you have the 7Cx keypair locally for signing)
  const wallet = await loadWallet();
  console.log('👛 Loaded wallet:', wallet.publicKey.toString());
  
  if (wallet.publicKey.toString() !== DESTINATION_WALLET) {
    console.log('⚠️  Warning: Loaded wallet does not match destination. Continuing anyway...');
  }
  
  let totalRecovered = 0;
  
  for (const accountStr of ACCOUNTS_TO_DRAIN) {
    try {
      console.log(`\n📝 Processing account: ${accountStr}`);
      const accountPubkey = new PublicKey(accountStr);
      
      // Check if account exists and get info
      const accountInfo = await connection.getAccountInfo(accountPubkey);
      if (!accountInfo) {
        console.log('   ❌ Account not found');
        continue;
      }
      
      console.log(`   💰 Lamports: ${accountInfo.lamports}`);
      console.log(`   👤 Owner: ${accountInfo.owner.toString()}`);
      
      // If it's owned by Token Program, try to decode as token account
      if (accountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        try {
          const tokenAccount = await getAccount(connection, accountPubkey);
          console.log(`   🪙 Token mint: ${tokenAccount.mint.toString()}`);
          console.log(`   🔢 Token amount: ${tokenAccount.amount}`);
          console.log(`   👑 Token authority: ${tokenAccount.owner.toString()}`);
          
          // If it has WSOL and we can control it
          if (tokenAccount.mint.equals(NATIVE_MINT) && tokenAccount.amount > 0) {
            const tx = new Transaction();
            
            // If the authority is our wallet, we can transfer and close
            if (tokenAccount.owner.equals(wallet.publicKey)) {
              console.log('   ✅ Can control this account directly');
              
              // Transfer WSOL to destination (need destination WSOL ATA)
              const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
              const destinationAta = await getAssociatedTokenAddress(NATIVE_MINT, destinationPubkey);
              
              // Check if destination ATA exists
              const destAtaInfo = await connection.getAccountInfo(destinationAta);
              if (!destAtaInfo) {
                console.log('   🏗️  Creating destination WSOL ATA');
                tx.add(createAssociatedTokenAccountInstruction(
                  wallet.publicKey, // payer
                  destinationAta,
                  destinationPubkey, // owner
                  NATIVE_MINT
                ));
              }
              
              // Transfer tokens
              tx.add(createTransferInstruction(
                accountPubkey,
                destinationAta,
                wallet.publicKey,
                Number(tokenAccount.amount)
              ));
              
              // Close account to reclaim rent
              tx.add(createCloseAccountInstruction(
                accountPubkey,
                destinationPubkey, // rent goes to destination
                wallet.publicKey
              ));
              
              tx.feePayer = wallet.publicKey;
              const { blockhash } = await connection.getLatestBlockhash();
              tx.recentBlockhash = blockhash;
              
              const signature = await connection.sendTransaction(tx, [wallet]);
              console.log(`   📡 Transaction sent: ${signature}`);
              
              await connection.confirmTransaction(signature, 'confirmed');
              console.log('   ✅ Confirmed');
              
              totalRecovered += Number(tokenAccount.amount);
            } else {
              console.log('   ⚠️  Cannot control this account (authority mismatch)');
              console.log(`      Need authority: ${tokenAccount.owner.toString()}`);
              console.log(`      We have: ${wallet.publicKey.toString()}`);
            }
          }
        } catch (e) {
          console.log('   ⚠️  Error processing token account:', (e as Error).message);
        }
      } else if (accountInfo.owner.equals(SystemProgram.programId)) {
        // Regular SOL account - can transfer if we own it
        if (accountPubkey.equals(wallet.publicKey)) {
          console.log('   💸 This is our own SOL account (nothing to do)');
        } else {
          console.log('   ⚠️  SOL account owned by different wallet');
        }
      } else {
        // Program-owned account
        console.log(`   🏛️  Program-owned account (owner: ${accountInfo.owner.toString()})`);
        console.log('   ⚠️  Cannot directly transfer from program accounts');
        
        // Check if this might be a fund PDA that we can interact with via program instructions
        if (accountInfo.owner.toString().includes('DEFuND') || accountInfo.data.length > 0) {
          console.log('   💡 This looks like a fund-related PDA');
          console.log('   📝 You may need to use the program\'s withdraw/close instructions');
          console.log(`   💰 Rent-exempt balance: ~${(accountInfo.lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
        }
      }
      
    } catch (e) {
      console.log(`   ❌ Error processing ${accountStr}:`, (e as Error).message);
    }
  }
  
  console.log(`\n🎉 Recovery complete!`);
  console.log(`💰 Total WSOL recovered: ${totalRecovered} lamports (${totalRecovered / LAMPORTS_PER_SOL} SOL)`);
  
  if (totalRecovered === 0) {
    console.log('\n💡 No funds were recovered. This could mean:');
    console.log('   • The accounts are program-controlled (need program instructions)');
    console.log('   • The accounts don\'t exist or are already empty');
    console.log('   • You need a different keypair to authorize the transfers');
    console.log('\n🔍 Consider using the program\'s built-in withdraw functionality instead.');
  }
}

main().catch(console.error);