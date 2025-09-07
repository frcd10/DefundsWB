import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const col = db.collection('Rwa');

    const docs = await col.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();
    const totalCount = await col.countDocuments();

    const items = docs.map((p: any) => ({
      id: p._id,
      fundId: p.fundId,
      name: p.name,
      description: p.description,
      type: p.fundType || 'General',
      manager: p.manager,
      tvl: p.totalDeposits || 0,
      perfFee: p.performanceFee || 0,
      investorCount: p.investorCount || 0,
      maxCapacity: p.maxCapacity || 0,
      isPublic: p.isPublic !== false,
      inviteOnly: p.isPublic === false,
      performance: p.performanceHistory || [{ date: new Date().toISOString(), nav: 1.0, pnl: 0, pnlPercentage: 0 }],
      stats: p.stats || { total: 0, wins: 0, losses: 0, avgWinPct: 0, avgWinSol: 0, avgLossPct: 0, avgLossSol: 0, drawdownPct: 0, drawdownSol: 0, topWins: [], topLosses: [] },
    }));

    return NextResponse.json({ success: true, data: { items, pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) } } });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to fetch RWA products' }, { status: 500 });
  }
}
