import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, sig, type, extra } = body || {};
    if (!wallet || !sig || !type) {
      return NextResponse.json({ ok: false, error: 'wallet, sig, type required' }, { status: 400 });
    }
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection('mainnetdebug');
    await col.updateOne(
      { _id: sig } as any,
      {
        $setOnInsert: { _id: sig },
        $set: {
          wallet,
          type,
          extra: extra || null,
          updatedAt: new Date(),
        },
        $push: { history: { $each: [{ at: new Date(), wallet, type, extra: extra || null }] } },
      } as any,
      { upsert: true } as any
    );
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
