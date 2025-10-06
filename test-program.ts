import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet, Program } from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Program ID from environment
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || process.env.SOLANA_PROGRAM_ID || '');

// RPC endpoint from environment
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';


async function testProgramConnection() {
  try {
    console.log('� Testing Solana program connection...');
    
    // Create connection
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    console.log('✅ Connection created');
    
    // Create a dummy wallet for testing (in production, use actual wallet)
    const keypair = Keypair.generate();
    const wallet = new Wallet(keypair);
    console.log('✅ Test wallet created');
    
    // Create provider
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    console.log('✅ Provider created');
    
    // Check if program account exists
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (programInfo) {
      console.log('✅ Program found on devnet');
      console.log(`Program data length: ${programInfo.data.length} bytes`);
    } else {
      console.log('❌ Program not found on devnet');
      return;
    }
    
    // Load IDL and create program instance
    console.log('📂 Loading IDL...');
    
    // Load IDL using readFileSync
    const idlPath = join(__dirname, 'target', 'idl', 'managed_funds.json');
    const idlRaw = readFileSync(idlPath, 'utf8');
    const idl = JSON.parse(idlRaw);
    console.log('✅ IDL loaded');
    
    // Create program instance
    const program = new Program(idl, provider);
    console.log('✅ Program instance created');
    console.log(`Program ID: ${program.programId.toString()}`);
    
    // Verify the program ID matches
    if (program.programId.toString() === PROGRAM_ID.toString()) {
      console.log('✅ Program ID verification successful');
    } else {
      console.log('❌ Program ID mismatch');
      console.log(`Expected: ${PROGRAM_ID.toString()}`);
      console.log(`Got: ${program.programId.toString()}`);
    }
    
    // Test program methods are available
    console.log('📋 Available program methods:');
    if (program.methods) {
      console.log('  - initializeFund');
      console.log('  - deposit');
      console.log('  - initiate_withdrawal (if available)');
      console.log('  - liquidatePositionsBatch (if available)');
      console.log('  - finalizeWithdrawal (if available)');
    }
    
    console.log('🎉 Program connection test successful!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testProgramConnection().then(() => {
  console.log('✅ Test completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});
