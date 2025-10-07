import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// GET /api/referrals?wallet=...
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
  try {
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const users = db.collection<any>('Users');

    const doc = await users.findOne({ _id: wallet }, { projection: { inviteCodes: 1, referralCode: 1, invitedUsers: 1, invitedList: 1, points: 1, totalInvested: 1, referredBy: 1 } });
    const referralCode = doc?.referralCode || (Array.isArray(doc?.inviteCodes) ? doc!.inviteCodes[0] : undefined);

    return NextResponse.json({ success: true, data: {
      wallet,
      referralCode: referralCode || null,
      inviteCodes: Array.isArray(doc?.inviteCodes) ? doc!.inviteCodes : [],
      invitedUsers: Number(doc?.invitedUsers || (Array.isArray(doc?.invitedList) ? doc!.invitedList.length : 0) || 0),
      invitedList: Array.isArray(doc?.invitedList) ? doc!.invitedList : [],
      points: Number(doc?.points || 0),
      totalInvested: Number(doc?.totalInvested || 0),
      referredBy: doc?.referredBy || null,
    }});
  } catch (e) {
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}

// POST /api/referrals { wallet, desiredCode }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet: string | undefined = body?.wallet;
    let desiredCode: string | undefined = body?.desiredCode;

    if (!wallet || typeof wallet !== 'string') return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    if (!desiredCode || typeof desiredCode !== 'string') return NextResponse.json({ success: false, error: 'desiredCode required' }, { status: 400 });

    // Normalize: uppercase, keep only alphanumerics, length 3-12
    desiredCode = desiredCode.replace(/[^a-zA-Z0-9]/g, '');
    if (desiredCode.length < 3 || desiredCode.length > 12) {
      return NextResponse.json({ success: false, error: 'Code must be 3-12 alphanumeric characters' }, { status: 400 });
    }
    const normalized = desiredCode.toUpperCase();

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const users = db.collection<any>('Users');
    const codes = db.collection('ReferralCodes');

    const now = new Date();
    const existingUser = await users.findOne({ _id: wallet }, { projection: { referralCode: 1 } });

    // Idempotency: if unchanged ignoring case, return success
    if (existingUser?.referralCode && existingUser.referralCode.toUpperCase() === normalized) {
      return NextResponse.json({ success: true, data: { referralCode: existingUser.referralCode, unchanged: true } });
    }

    // Uniqueness check (case-insensitive across all codes)
    const regex = new RegExp(`^${normalized.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
    const taken = await codes.findOne({ code: { $regex: regex } });
    if (taken) {
      // If taken by same owner and same code (case-insensitive), treat as success
      if ((taken as any).owner === wallet) {
        await users.updateOne({ _id: wallet }, { $set: { referralCode: (taken as any).code, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true });
        return NextResponse.json({ success: true, data: { referralCode: (taken as any).code } });
      }
      return NextResponse.json({ success: false, error: 'Referral code not available' }, { status: 409 });
    }

    // Retire previous code if exists
    if (existingUser?.referralCode) {
      await codes.updateOne({ code: existingUser.referralCode }, { $set: { status: 'retired', retiredAt: now } });
    }

    // Create or replace code for this wallet (single doc per wallet)
    await codes.updateOne(
      { _id: wallet as any },
      { $setOnInsert: { createdAt: now, owner: wallet }, $set: { code: normalized, status: 'active', source: 'user-chosen', updatedAt: now } },
      { upsert: true }
    );

    await users.updateOne(
      { _id: wallet },
      { $addToSet: { inviteCodes: normalized }, $set: { referralCode: normalized, updatedAt: now }, $setOnInsert: { createdAt: now, points: 0, totalInvested: 0, invitedUsers: 0, invitedList: [] } },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: { referralCode: normalized } });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
