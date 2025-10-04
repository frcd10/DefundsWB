import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// Helper to generate an 8-char uppercase code
async function generateUniqueCode(db: any): Promise<string> {
  const col = db.collection('ReferralCodes');
  while (true) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const exists = await col.findOne({ code });
    if (!exists) return code;
  }
}

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
    const users = db.collection<any>('Users');

    const now = new Date();
    const existing = await users.findOne({ _id: wallet }, { projection: { referralCode: 1, inviteCodes: 1 } });

    // If user exists, just bump updatedAt and ensure baseline fields
    if (existing) {
      await users.updateOne(
        { _id: wallet },
        { $set: { updatedAt: now }, $inc: { connectCount: 1 } }
      );
      return NextResponse.json({ success: true, data: { referralCode: existing.referralCode, inviteCodes: existing.inviteCodes || [] } });
    }

    // Create new user and generate one referral code to start
    const referralCode = await generateUniqueCode(db);

    await users.updateOne(
      { _id: wallet },
      {
        $setOnInsert: {
          createdAt: now,
          points: 0,
          totalInvested: 0,
          invitedUsers: 0,
          invitedList: [],
          referralCode,
          inviteCodes: [referralCode],
        },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );

    // Track code ownership in separate collection
    await db.collection('ReferralCodes').insertOne({
      code: referralCode,
      owner: wallet,
      status: 'active',
      createdAt: now,
      source: 'connect',
    });

    return NextResponse.json({ success: true, data: { referralCode, inviteCodes: [referralCode] } });
  } catch (e) {
    console.error('[users/connect] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
