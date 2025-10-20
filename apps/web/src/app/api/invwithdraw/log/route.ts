import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// Accepts either a single total log (legacy) or a recipients array for per-wallet attribution
// Body: { fundId: string, signature: string, recipients?: [{ wallet, amountSol }], amountSol?: number }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fundId = String(body.fundId || '').trim();
    const signature = String(body.signature || '').trim();
    const recipients: Array<{ wallet: string; amountSol: number }> = Array.isArray(body.recipients) ? body.recipients : [];
    const now = new Date();

    if (!fundId) return NextResponse.json({ success: false, error: 'fundId required' }, { status: 400 });
    if (!signature) return NextResponse.json({ success: false, error: 'signature required' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection('invWithdraw');

    if (recipients.length > 0) {
      // Upsert per wallet: _id = wallet, push entry under funds.<fundId>
      const ops = recipients
        .filter(r => Number.isFinite(Number(r.amountSol)) && Number(r.amountSol) > 0 && typeof r.wallet === 'string' && r.wallet.length > 0)
        .map((r) => ({
          updateOne: {
            filter: { _id: r.wallet },
            update: {
              $setOnInsert: { createdAt: now },
              $set: { updatedAt: now },
              $push: { [`funds.${fundId}`]: { amountSol: Number(r.amountSol), signature, timestamp: now } },
            },
            upsert: true,
          }
        }));
      if (ops.length === 0) return NextResponse.json({ success: false, error: 'no valid recipients' }, { status: 400 });
      await col.bulkWrite(ops as any);
      return NextResponse.json({ success: true, data: { updated: ops.length } }, { status: 201 });
    }

    // Legacy: single total amount without recipients (not recommended)
    const amountSolNum = Number(body.amountSol);
    if (!Number.isFinite(amountSolNum) || amountSolNum <= 0) return NextResponse.json({ success: false, error: 'amountSol must be > 0 or provide recipients' }, { status: 400 });
    await col.insertOne({ fundId, amountSol: amountSolNum, signature, timestamp: now, source: 'payout' } as any);
    return NextResponse.json({ success: true, data: { inserted: true } }, { status: 201 });
  } catch (e) {
    console.error('[invwithdraw/log] POST error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
