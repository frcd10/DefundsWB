import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// GET /api/leaderboard?limit=50
// Returns top users ordered by points desc with: address, invitedUsers, totalInvested, points
export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));

    const client = await getClientPromise();
    const db = client.db('Defunds');
    const users = db.collection<any>('Users');

    // Compute invited users and total invested live from DB
    const pipeline = [
      // Prepare basic fields and sort/limit early for efficiency
      { $project: { address: '$_id', points: { $ifNull: ['$points', 0] }, storedTotalInvested: { $ifNull: ['$totalInvested', 0] } } },
      { $sort: { points: -1 } },
      { $limit: limit },

      // Invited users: count Users where referredBy == address
      {
        $lookup: {
          from: 'Users',
          let: { addr: '$address' },
          pipeline: [
            { $match: { $expr: { $eq: ['$referredBy', '$$addr'] } } },
            { $group: { _id: null, cnt: { $sum: 1 } } },
          ],
          as: 'invitedAgg',
        },
      },
      { $addFields: { invitedUsersCalc: { $ifNull: [{ $arrayElemAt: ['$invitedAgg.cnt', 0] }, 0] } } },

      // Total invested from Funds.investments
      {
        $lookup: {
          from: 'Funds',
          let: { addr: '$address' },
          pipeline: [
            { $project: { investments: 1 } },
            { $unwind: { path: '$investments', preserveNullAndEmptyArrays: false } },
            { $match: { $expr: { $eq: ['$investments.walletAddress', '$$addr'] } } },
            { $group: { _id: null, amt: { $sum: { $ifNull: ['$investments.amount', 0] } } } },
          ],
          as: 'fundsAgg',
        },
      },
      { $addFields: { fundsInvestedCalc: { $ifNull: [{ $arrayElemAt: ['$fundsAgg.amt', 0] }, 0] } } },

      // Total invested from Rwa.investments
      {
        $lookup: {
          from: 'Rwa',
          let: { addr: '$address' },
          pipeline: [
            { $project: { investments: 1 } },
            { $unwind: { path: '$investments', preserveNullAndEmptyArrays: false } },
            { $match: { $expr: { $eq: ['$investments.walletAddress', '$$addr'] } } },
            { $group: { _id: null, amt: { $sum: { $ifNull: ['$investments.amount', 0] } } } },
          ],
          as: 'rwaAgg',
        },
      },
      { $addFields: { rwaInvestedCalc: { $ifNull: [{ $arrayElemAt: ['$rwaAgg.amt', 0] }, 0] } } },
      { $addFields: { totalInvestedCalc: { $add: ['$fundsInvestedCalc', '$rwaInvestedCalc'] } } },

      // Final projection
      {
        $project: {
          address: 1,
          points: 1,
          invitedUsers: '$invitedUsersCalc',
          totalInvested: { $ifNull: ['$totalInvestedCalc', '$storedTotalInvested'] },
        },
      },
    ];

    const rows = await users.aggregate(pipeline).toArray();

    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    console.error('[leaderboard] GET error', e);
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
