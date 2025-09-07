import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// GET /api/profile?wallet=...
// POST /api/profile { wallet, name, bio, twitter, discord, website }

type PublicProfile = {
  name: string;
  bio?: string;
  twitter?: string;
  discord?: string;
  website?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type UserDoc = {
  _id: string; // wallet address as id
  publicProfile?: PublicProfile;
  createdAt?: Date;
  updatedAt?: Date;
};

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ success: false, error: 'wallet required' }, { status: 400 });
  try {
    const client = await getClientPromise();
    const db = client.db('Defunds');
  const col = db.collection<UserDoc>('Users');

  const doc = await col.findOne({ _id: wallet });

    // Compute simple stats from Funds collection
    const fundsCol = db.collection('Funds');
    const funds = await fundsCol
      .find({ manager: wallet })
      .project({ name: 1, fundId: 1, isPublic: 1, performance: 1 })
      .toArray();

  const products = funds.length;
    let avgReturnPct = 0;
    if (products > 0) {
      let totalPct = 0;
      for (const f of funds as any[]) {
        const perf = Array.isArray(f.performance) ? f.performance : [];
        if (perf.length >= 1 && typeof perf[0]?.nav === 'number') {
          const first = perf[0].nav as number;
          const last = (perf[perf.length - 1]?.nav as number) ?? first;
          if (first > 0) totalPct += ((last - first) / first) * 100;
        }
      }
      avgReturnPct = totalPct / products;
    }

    const openItems = (funds as any[])
      .filter((f) => f.isPublic)
      .slice(0, 5)
      .map((f) => ({ id: (f.fundId as string) || String(f._id), name: f.name as string, type: 'Fund' }));

    const baseData = {
      wallet,
      name: doc?.publicProfile?.name || '',
      bio: doc?.publicProfile?.bio,
      twitter: doc?.publicProfile?.twitter,
      discord: doc?.publicProfile?.discord,
      website: doc?.publicProfile?.website,
      stats: { products, avgReturnPct },
      openItems,
    };

    return NextResponse.json({
      success: true,
      data: baseData,
    });
  } catch (e) {
    console.error('[profile] GET error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, name, bio, twitter, discord, website } = body || {};
    if (!wallet || !name) return NextResponse.json({ success: false, error: 'wallet and name required' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection<UserDoc>('Users');
    const now = new Date();

    await col.updateOne(
      { _id: wallet },
      {
        $set: {
          'publicProfile.name': name,
          'publicProfile.bio': bio || '',
          'publicProfile.twitter': twitter || '',
          'publicProfile.discord': discord || '',
          'publicProfile.website': website || '',
          updatedAt: now,
          'publicProfile.updatedAt': now,
        },
        $setOnInsert: { createdAt: now, 'publicProfile.createdAt': now },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[profile] POST error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
