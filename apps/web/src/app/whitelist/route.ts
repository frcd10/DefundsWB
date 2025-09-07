/* POST /whitelist – save whitelist entry with expanded fields */
import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';
import { getRateLimitInfo } from '@/lib/rateLimit';

type Role = 'trader' | 'investor';

interface WhitelistRequest {
  name: string;
  email: string;
  wallet: string;
  phone?: string;
  twitter?: string;
  discord?: string;
  role: Role;
}

export async function POST(req: NextRequest) {
  try {
    const rate = getRateLimitInfo(req);
    if (!rate.allowed) {
      return NextResponse.json({ success: false, error: rate.message || 'Rate limit exceeded' }, { status: 429 });
    }

    const body = (await req.json()) as WhitelistRequest;
    const { name, email, wallet, role } = body;

    if (!name?.trim() || !email?.trim() || !wallet?.trim() || !role) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (!['trader', 'investor'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
    }

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const collection = role === 'trader' ? db.collection('Traders') : db.collection('Investors');

    const emailId = email.toLowerCase().trim();
    const doc = {
      _id: emailId, // email as _id
      name: name.trim(),
      email: emailId,
      wallet: wallet.trim(),
      phone: body.phone?.trim() || null,
      twitter: body.twitter?.trim() || null,
      discord: body.discord?.trim() || null,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as const;

    try {
      await collection.insertOne(doc as any);
    } catch (e: any) {
      if (e?.code === 11000) {
        return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });
      }
      throw e;
    }

    return NextResponse.json({ success: true, id: emailId });
  } catch (err) {
    console.error('[whitelist] error', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
