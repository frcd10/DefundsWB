import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { getRateLimitInfo } from '@/lib/rateLimit';

/* POST /api/subscribe { wallet, email }
   - Saves (wallet,email,createdAt) into Defunds.subscribers (upsert on wallet)
   - Also updates Users collection privateProfile.email (creating user doc if needed)
*/

export async function POST(req: NextRequest) {
  try {
    // Rate limit (independent bucket using IP only; could extend to wallet/IP combo)
    const rl = getRateLimitInfo(req);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: rl.message || 'Rate limit exceeded' }, { status: 429 });
    }

    const { wallet, email } = await req.json();
    if (!wallet) return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    if (!email) return NextResponse.json({ success: false, error: 'email required' }, { status: 400 });

    const emailTrimmed = String(email).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      return NextResponse.json({ success: false, error: 'invalid email' }, { status: 400 });
    }

    const client = await getClientPromise();
    const db = client.db('Defunds');

    const subscribers = db.collection('subscribers');
    const now = new Date();

    await subscribers.updateOne(
      { _id: wallet },
      { $set: { _id: wallet, wallet, email: emailTrimmed, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );

    // Also update user private profile email (non-destructive for other fields)
    const users = db.collection('Users');
    await users.updateOne(
      { _id: wallet },
      {
        $set: {
          'privateProfile.email': emailTrimmed,
          'privateProfile.updatedAt': now,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
          'publicProfile.createdAt': now,
          'privateProfile.createdAt': now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[subscribe] POST error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
