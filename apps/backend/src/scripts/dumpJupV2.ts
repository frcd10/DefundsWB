import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createJupiterApiClient, QuoteGetRequest, SwapInstructionsPostRequest, ResponseError } from '@jup-ag/api';

/*
Option A: Fetch a fresh shared_accounts_route_v2 instruction from Jupiter API and dump:
- Program ID, first 8 bytes (discriminator) hex
- Accounts (ordered)
- Data length and first 64 bytes hex

Usage (env):
  SOLANA_RPC_URL=... node tsx src/scripts/dumpJupV2.ts <inputMint> <outputMint> <amount>
*/

function hex(buf: Uint8Array): string { return Buffer.from(buf).toString('hex'); }

async function main() {
  const [inputMintArg, outputMintArg, amountArg] = process.argv.slice(2);
  if (!inputMintArg || !outputMintArg || !amountArg) {
    console.error('Usage: tsx src/scripts/dumpJupV2.ts <inputMint> <outputMint> <amountInteger>');
    process.exit(1);
  }
  const inputMint = new PublicKey(inputMintArg);
  const outputMint = new PublicKey(outputMintArg);
  const amount = BigInt(amountArg);

  const rpc = process.env.SOLANA_RPC_URL!;
  const conn = new Connection(rpc, 'confirmed');
  const wallet = Keypair.generate();

  const jup = createJupiterApiClient({ basePath: 'https://public.jupiterapi.com' });
  const quoteReq: QuoteGetRequest = {
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: Number(amount),
    slippageBps: 50,
    onlyDirectRoutes: false,
  } as any;

  try {
    const quote = await jup.quoteGet(quoteReq);
    if (!quote) throw new Error('No quote');
    const swapReq: SwapInstructionsPostRequest = {
      swapRequest: {
        quoteResponse: quote as any,
        userPublicKey: wallet.publicKey.toBase58(),
        useSharedAccounts: true,
        dynamicComputeUnitLimit: true,
      }
    } as any;
    const swapIxs = await jup.swapInstructionsPost(swapReq);
    if (!swapIxs) throw new Error('No swap instructions');

    // Locate the Router (JUP6...) swap instruction
    const all = [
      ...(swapIxs.setupInstructions || []),
      ...(swapIxs.swapInstruction ? [swapIxs.swapInstruction] : []),
      ...(swapIxs.cleanupInstruction ? [swapIxs.cleanupInstruction] : []),
    ];
    const routerIx = all.find(ix => ix.programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4');
    if (!routerIx) throw new Error('Router instruction not found');

    const dataB64 = routerIx.data as string;
    const data = Buffer.from(dataB64, 'base64');
    const discr = data.subarray(0, 8);
    const headHex = hex(data.subarray(0, Math.min(64, data.length)));

    console.log('--- Jupiter v2 Router CPI (Option A) ---');
    console.log('programId:', routerIx.programId);
    console.log('discriminatorHex:', hex(discr));
    console.log('dataLen:', data.length);
    console.log('dataHeadHex64:', headHex);
    console.log('accounts:');
    routerIx.accounts.forEach((a: any, i: number) => {
      console.log(`#${String(i + 1).padStart(2, ' ')} ${a.pubkey} writable=${!!a.isWritable} signer=${!!a.isSigner}`);
    });
  } catch (e: any) {
    if (e instanceof ResponseError) {
      console.error('Jupiter error:', await e.response.json());
    } else {
      console.error('Error:', e.message || e);
    }
    process.exit(1);
  }
}

main();
