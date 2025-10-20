import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const investor = String(payload?.investor || '').trim();
    const fundId = String(payload?.fundId || '').trim();
    const amountSol = Number(payload?.amountSol);
    const signature = String(payload?.signature || '').trim();
    const details = payload?.details as any | undefined;

    if (!investor || investor.length < 32) return NextResponse.json({ success: false, error: 'Invalid payload: investor' }, { status: 400 });
    if (!fundId) return NextResponse.json({ success: false, error: 'Invalid payload: fundId' }, { status: 400 });
    if (!Number.isFinite(amountSol) || amountSol < 0) return NextResponse.json({ success: false, error: 'Invalid payload: amountSol' }, { status: 400 });
    if (!signature || signature.length < 32) return NextResponse.json({ success: false, error: 'Invalid payload: signature' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection<any>('invWithdraw');

    const entry: any = {
      amountSol,
      signature,
      timestamp: new Date().toISOString(),
    };
    if (details && typeof details === 'object') entry.details = details;

    const path = `funds.${fundId}`;
    const updateDoc: any = {
      $setOnInsert: { _id: investor },
      $push: { [path]: entry },
      $set: { updatedAt: new Date() },
    };
    const result = await col.updateOne({ _id: investor } as any, updateDoc, { upsert: true });

    return NextResponse.json({ success: true, data: { upsertedId: (result as any).upsertedId ?? undefined } });
  } catch (e: any) {
    console.error('[withdraw/record] error', e?.message || e);
    return NextResponse.json({ success: false, error: 'Failed to record withdraw' }, { status: 500 });
  }
}

export function GET() { return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 }); }
