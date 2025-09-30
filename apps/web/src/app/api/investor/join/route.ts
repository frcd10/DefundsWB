import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { getRateLimitInfo } from '@/lib/rateLimit';

/* POST /api/investor/join { name, email, wallet, message?, phone?, telegram?, x?, investmentGoal? }
   Upserts record in Defunds.Investors collection keyed by _id = wallet */
export async function POST(req: NextRequest) {
  try {
    // Basic IP-based rate limiting (shared escalating logic). Mitigates spam submissions.
    const rl = getRateLimitInfo(req);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: rl.message || 'rate limited' }, { status: 429 });
    }
    const { name, email, message, phone, telegram, x, investmentGoal, wallet } = await req.json();
    if (!wallet) return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
    if (!name || !email) return NextResponse.json({ success: false, error: 'name & email required' }, { status: 400 });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return NextResponse.json({ success: false, error: 'invalid email' }, { status: 400 });
    const allowedGoals = ['<25k','25-150k','>150k'];
    if (investmentGoal && !allowedGoals.includes(investmentGoal)) return NextResponse.json({ success: false, error: 'invalid investmentGoal' }, { status: 400 });
    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection('Investors');
    const now = new Date();
    await col.updateOne(
      { _id: wallet },
      { $set: {
          name: String(name).trim(),
          email: email.toLowerCase().trim(),
          message: (message||'').trim(),
          phone: (phone||'').trim(),
          telegram: (telegram||'').trim(),
          x: (x||'').trim(),
          investmentGoal: investmentGoal || null,
          wallet,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[investor/join] error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
