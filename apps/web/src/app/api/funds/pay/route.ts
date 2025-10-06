import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { Connection } from '@solana/web3.js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fundId, manager, amount, signature, recipients } = body as {
      fundId: string;
      manager: string;
      amount: number;
      signature: string;
      recipients: Array<{ wallet: string; amountSol: number }>;
    };
    if (!fundId || !manager || !signature || typeof amount !== 'number' || amount <= 0 || !Array.isArray(recipients)) {
      return NextResponse.json({ success: false, error: 'Missing or invalid fields' }, { status: 400 });
    }

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!tx) return NextResponse.json({ success: false, error: 'Invalid transaction signature' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');

    // Ensure fund exists and owned by manager
    const fund = await db.collection('Funds').findOne({ fundId, manager });
    if (!fund) return NextResponse.json({ success: false, error: 'Fund not found or not owned by manager' }, { status: 404 });

    // Idempotency: if we already recorded this payout signature, return success
    const dup = await db.collection('Funds').findOne({ fundId, 'payments.signature': signature });
    if (dup) {
      return NextResponse.json({ success: true, data: { signature, amount, recipients, idempotent: true } });
    }

    const now = new Date();
    await db.collection('Funds').updateOne(
      { fundId },
      {
        $set: { updatedAt: now },
        $inc: { totalDeposits: -amount, solBalance: -amount, currentValue: -amount },
        $push: {
          payments: {
            timestamp: now,
            totalValue: amount,
            signature,
            recipients,
          },
        },
      } as unknown as Record<string, unknown>
    );

    return NextResponse.json({ success: true, data: { signature, amount, recipients, timestamp: now } });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
