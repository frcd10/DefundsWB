import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import crypto from 'crypto';
import axios from 'axios';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// MOCK SWAP ENDPOINT (dev / non-mainnet)
// When NOT on mainnet-beta this just performs off-chain accounting with optional signature presence.
// Future: On mainnet-beta integrate real DEX (Jupiter / SPL Token Swap) and require a verified signature & amounts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fundId, manager, fromMint, toMint, inAmountLamports, outAmountLamports, signature, routeMeta, slippageBps } = body as {
      fundId: string; manager: string; fromMint: string; toMint: string; inAmountLamports: number; outAmountLamports?: number; signature?: string; routeMeta?: unknown; slippageBps?: number;
    };

  if (!fundId || !manager || !fromMint || !toMint || !inAmountLamports) {
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
    }

    // Verify manager controls the fund
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const fund = await db.collection('Funds').findOne({ fundId, manager });
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found or not owned by manager' }, { status: 404 });

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
    const isMainnet = cluster === 'mainnet-beta';
  if (isMainnet && signature) {
      try {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
        const conn = new Connection(rpcUrl, 'confirmed');
        const tx = await conn.getTransaction(signature, { commitment: 'confirmed' });
        if (!tx || tx.meta?.err) return NextResponse.json({ success: false, error: 'Invalid swap signature' }, { status: 400 });
      } catch {
        return NextResponse.json({ success: false, error: 'Failed to verify mainnet swap signature' }, { status: 400 });
      }
    }

  // Basic accounting: track positions map by mint and a solBalance field
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const fromIsSol = fromMint === SOL_MINT;
    const toIsSol = toMint === SOL_MINT;

    // Convert lamports amount to SOL for TVL adjustments when SOL is involved
    const inAmountSOL = inAmountLamports / LAMPORTS_PER_SOL;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const tradeRecord = { timestamp: new Date(), fromMint, toMint, inAmountLamports, outAmountLamports: outAmountLamports || null, signature: signature || null, routeMeta: routeMeta || null };

    // Initialize positions structure if absent
    const positions = fund.positions || {};
    const solBalance = fund.solBalance || 0;

    // Update local accounting
    let newSol = solBalance;
  if (fromIsSol) newSol -= inAmountSOL;
  if (toIsSol && outAmountLamports) newSol += (outAmountLamports / LAMPORTS_PER_SOL);

    // Track token side: decrement fromMint amount, increment toMint amount (approx; precise via UI estimates)
    const pos = { ...(positions as Record<string, number>) };
    pos[fromMint] = (pos[fromMint] || 0) - inAmountLamports; // subtract input
    if (outAmountLamports && outAmountLamports > 0) {
      pos[toMint] = (pos[toMint] || 0) + outAmountLamports; // add received (already in that token's native units)
    } else if (pos[toMint] === undefined) {
      pos[toMint] = 0; // ensure key exists
    }

    // Clamp negatives to zero and drop dust (< 1 unit depending on SOL vs token decimals not known here)
    for (const k of Object.keys(pos)) {
      if (pos[k] < 0) pos[k] = 0;
      if (Math.abs(pos[k]) < 1) {
        // leave small integer units so UI can still reflect movement; adjust rule if needed
        if (pos[k] === 0) delete pos[k];
      }
    }

    updates['positions'] = pos;
  updates['solBalance'] = newSol < 0 ? 0 : newSol;

    await db.collection('Funds').updateOne(
      { fundId },
      { $set: updates, $push: { trades: tradeRecord } } as unknown as Record<string, unknown>
    );

    // Build common PDAs and accounts for both devnet and mainnet
  const rpcUrl = process.env.SOLANA_RPC_URL || (isMainnet ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
    const conn = new Connection(rpcUrl, 'confirmed');
  const PID_STR = (process.env.SOLANA_PROGRAM_ID || process.env.NEXT_PUBLIC_SOLANA_PROGRAM_ID || '').trim();
  if (!PID_STR) return NextResponse.json({ success: false, error: 'Program ID not configured in env' }, { status: 500 });
  const PROGRAM_ID = new PublicKey(PID_STR);
    const managerPk = new PublicKey(manager);
    const [fundPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('fund'), managerPk.toBuffer(), Buffer.from(String(fund.name))],
      PROGRAM_ID
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), fundPda.toBuffer()],
      PROGRAM_ID
    );

    // Build authorize instruction (pre)
    const discriminator = crypto
      .createHash('sha256')
      .update('global:authorize_defund_swap')
      .digest()
      .subarray(0, 8);
    const inputMintPk = new PublicKey(fromMint);
    const amountBuf = Buffer.alloc(8);
    amountBuf.writeBigUInt64LE(BigInt(inAmountLamports));
    const authData = Buffer.concat([discriminator, inputMintPk.toBuffer(), amountBuf]);
    const authKeys = [
      { pubkey: fundPda, isWritable: true, isSigner: false },
      { pubkey: vaultPda, isWritable: true, isSigner: false },
      { pubkey: managerPk, isWritable: false, isSigner: true },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ];
    const authorizeIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: authKeys, data: authData });

    // Prepare ATAs we may need
    const treasury = process.env.TREASURY_WALLET || '';
    const treasuryPk = treasury ? new PublicKey(treasury) : null;
    const outMintPk = new PublicKey(toMint);
    const fundOutAta = await getAssociatedTokenAddress(outMintPk, fundPda, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const treasuryOutAta = treasuryPk ? await getAssociatedTokenAddress(outMintPk, treasuryPk, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID) : null;

    // Optionally add ATA create ix if missing (best-effort)
    const maybeCreateIxs: TransactionInstruction[] = [];
    const fundOutInfo = await conn.getAccountInfo(fundOutAta);
    if (!fundOutInfo) {
      maybeCreateIxs.push(createAssociatedTokenAccountInstruction(managerPk, fundOutAta, fundPda, outMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    if (treasuryPk && treasuryOutAta) {
      const trInfo = await conn.getAccountInfo(treasuryOutAta);
      if (!trInfo) {
        maybeCreateIxs.push(createAssociatedTokenAccountInstruction(managerPk, treasuryOutAta, treasuryPk, outMintPk, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
      }
    }

    // DEVNET: Build and return pre + memo + post unsigned; also keep mock summary
    if (!isMainnet) {
      try {
        const recent = await conn.getLatestBlockhash('finalized');
        // Optional memo for human readability
        const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        const estOut = outAmountLamports || 0;
        const feeBps = 10; // 0.10%
        const memoText = `MOCK DEFUNDSWAP: ${inAmountLamports} lamports (${(inAmountLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL) -> ~${estOut} (${toMint === SOL_MINT ? (estOut / LAMPORTS_PER_SOL).toFixed(6) + ' SOL' : 'token units'}) | fee=${feeBps}bps to treasury`;
        const memoIx = new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memoText, 'utf8') });

        // PRE tx: authorize + create ATAs + memo
        const preMsg = new TransactionMessage({ payerKey: managerPk, recentBlockhash: recent.blockhash, instructions: [authorizeIx, ...maybeCreateIxs, memoIx] }).compileToV0Message();
        const preTx = new VersionedTransaction(preMsg);
        const preBase64 = Buffer.from(preTx.serialize()).toString('base64');

        // POST tx: revoke authorization
        const revDisc = crypto.createHash('sha256').update('global:revoke_defund_swap').digest().subarray(0, 8);
        const revokeData = Buffer.from(revDisc); // no args
        const revokeKeys = [
          { pubkey: fundPda, isWritable: true, isSigner: false },
          { pubkey: vaultPda, isWritable: true, isSigner: false },
          { pubkey: managerPk, isWritable: false, isSigner: true },
          { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
        ];
        const revokeIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: revokeKeys, data: revokeData });
        const postMsg = new TransactionMessage({ payerKey: managerPk, recentBlockhash: recent.blockhash, instructions: [revokeIx] }).compileToV0Message();
        const postTx = new VersionedTransaction(postMsg);
        const postBase64 = Buffer.from(postTx.serialize()).toString('base64');

        const human = `Mock swap ${(inAmountLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL -> ~${toIsSol ? (estOut / LAMPORTS_PER_SOL).toFixed(6) + ' SOL' : estOut + ' units'} via DEFUNDSWAP authorize (no send on devnet).`;

        return NextResponse.json({
          success: true,
          data: {
            fundId,
            positions: pos,
            solBalance: updates['solBalance'],
            mock: true,
            devnetPreTxBase64: preBase64,
            devnetPostTxBase64: postBase64,
            devnetMemo: memoText,
            summary: human,
            accounts: { fundPda: fundPda.toBase58(), vaultPda: vaultPda.toBase58(), manager: managerPk.toBase58() },
          }
        });
      } catch (e) {
        // If tx build fails, still return the accounting changes
        return NextResponse.json({ success: true, data: { fundId, positions: pos, solBalance: updates['solBalance'], mock: true, note: 'devnet tx build failed' } });
      }
    }

    // MAINNET: build Jupiter swap and return pre/swap/post transactions (unsigned)
    try {
      const recent = await conn.getLatestBlockhash('finalized');

      // PRE tx
      const preMsg = new TransactionMessage({ payerKey: managerPk, recentBlockhash: recent.blockhash, instructions: [authorizeIx, ...maybeCreateIxs] }).compileToV0Message();
      const preTx = new VersionedTransaction(preMsg);
      const preBase64 = Buffer.from(preTx.serialize()).toString('base64');

      // Quote from Jupiter
      const jupQuoteUrl = 'https://quote-api.jup.ag/v6/quote';
      const quoteRes = await axios.get(jupQuoteUrl, { params: { inputMint: fromMint, outputMint: toMint, amount: String(inAmountLamports), slippageBps: slippageBps ?? 50 } });
      const quote = quoteRes.data;

      // Build swap tx with 10bps fee to treasury
      const swapUrl = 'https://quote-api.jup.ag/v6/swap';
      const swapBody: any = {
        quoteResponse: quote,
        userPublicKey: managerPk.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
        feeBps: 10,
      };
      if (treasuryOutAta) swapBody.feeAccount = treasuryOutAta.toBase58();
      // Try to hint custom source/destination accounts (delegate on source)
      swapBody.sourceTokenAccount = vaultPda.toBase58();
      swapBody.destinationTokenAccount = fundOutAta.toBase58();

      const swapRes = await axios.post(swapUrl, swapBody);
      const swapTxBase64 = swapRes.data.swapTransaction as string; // base64 unsigned

      // POST tx (revoke)
      const revDisc = crypto.createHash('sha256').update('global:revoke_defund_swap').digest().subarray(0, 8);
      const revokeData = Buffer.from(revDisc);
      const revokeKeys = [
        { pubkey: fundPda, isWritable: true, isSigner: false },
        { pubkey: vaultPda, isWritable: true, isSigner: false },
        { pubkey: managerPk, isWritable: false, isSigner: true },
        { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      ];
      const revokeIx = new TransactionInstruction({ programId: PROGRAM_ID, keys: revokeKeys, data: revokeData });
      const postMsg = new TransactionMessage({ payerKey: managerPk, recentBlockhash: recent.blockhash, instructions: [revokeIx] }).compileToV0Message();
      const postTx = new VersionedTransaction(postMsg);
      const postBase64 = Buffer.from(postTx.serialize()).toString('base64');

      return NextResponse.json({ success: true, data: { fundId, positions: pos, solBalance: updates['solBalance'], mock: false, preTxBase64: preBase64, swapTxBase64, postTxBase64: postBase64, accounts: { fundPda: fundPda.toBase58(), vaultPda: vaultPda.toBase58(), fundOutAta: fundOutAta.toBase58(), treasuryOutAta: treasuryOutAta?.toBase58() } } });
    } catch (e) {
      console.error('[trader/swap mainnet build] error', e);
      return NextResponse.json({ success: false, error: 'failed to build mainnet swap' }, { status: 500 });
    }
  } catch (e) {
    console.error('[trader/swap] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
