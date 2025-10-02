import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    if (!wallet) return NextResponse.json({ success: false, error: 'wallet is required' }, { status: 400 });

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const funds = await db.collection('Funds').find({ manager: wallet }).project({
      _id: 1,
      fundId: 1,
      name: 1,
      manager: 1,
      totalShares: 1,
      totalDeposits: 1,
      currentValue: 1,
      positions: 1,
      solBalance: 1,
      investments: 1,
      payments: 1,
      access: 1,
      accessMode: 1,
    }).toArray();
    const rwas = await db.collection('Rwa').find({ manager: wallet }).project({
      _id: 1,
      fundId: 1,
      name: 1,
      manager: 1,
      totalShares: 1,
      currentValue: 1,
      investments: 1,
      payments: 1,
    }).toArray();

  const eligible = (funds.length + rwas.length) > 0;
  const treasury = process.env.TREASURY_WALLET || null;
  return NextResponse.json({ success: true, data: { eligible, funds, rwas, treasury } });
  } catch {
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
