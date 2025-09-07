import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// POST /api/users/connect { wallet }
// Ensures a Users document exists with _id = wallet and timestamps
export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();
    if (!wallet || typeof wallet !== 'string' || wallet.length < 20) {
      return NextResponse.json({ success: false, error: 'invalid wallet' }, { status: 400 });
    }

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const users = db.collection<{ _id: string; createdAt?: Date; updatedAt?: Date }>('Users');

    const now = new Date();
    await users.updateOne(
      { _id: wallet },
      { $setOnInsert: { createdAt: now }, $set: { updatedAt: now } },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[users/connect] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
