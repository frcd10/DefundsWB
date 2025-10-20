import { NextRequest, NextResponse } from 'next/server';
import getClientPromise from '@/lib/mongodb';

// Static snapshot: "devnet_snapshot" — immutable
const DEVNET_SNAPSHOT: Array<{ address: string; invitedUsers: number; totalInvested: number; points: number }> = [
  { address: 'GnrCmBSb714tARnAGYGBviGhCsjhggEnLYGQf1wjBpn', invitedUsers: 0, totalInvested: 50, points: 500 },
  { address: 'GKuz3gg82hWUzZ43p5T6aYrnjnYbzerqVm7yVqCiL3YC', invitedUsers: 5, totalInvested: 3, points: 75 },
  { address: 'HBRVJcyXyWPHjqH85cDAsudEPfa6DcrtNDBCqngoPt3v', invitedUsers: 0, totalInvested: 2.9, points: 72.5 },
  { address: '7XXem1c54swHcUscea39WRoUhqwJNL8fcCN2Ch9S9Hzw', invitedUsers: 0, totalInvested: 4.8, points: 62 },
  { address: 'Aq98n2E9s3Bk3NGeiscaDajGNoHhVRi9jMQpDkArB49E', invitedUsers: 0, totalInvested: 2, points: 50 },
  { address: 'E9qqpbrgBFdCbGyaGJ6okH2Yd7zs7aUeSXuwRc59rRPk', invitedUsers: 0, totalInvested: 1.9, points: 47.5 },
  { address: 'BHPSyWud7hf62AJjZBq8ttaafVfMURYTNwzu6YaXmTRL', invitedUsers: 0, totalInvested: 1, points: 30 },
  { address: 'HPgFSv1uyYgFAmSTSR7JpMGkB2Zwrck1WzHDAHhm7Ab7', invitedUsers: 0, totalInvested: 1.2, points: 30 },
  { address: 'DZyffHk28yLcV3PH7t9U88stZkKZLFgx94K8KkfzByXN', invitedUsers: 2, totalInvested: 1, points: 24 },
  { address: '2HWmaoebtJXHU1sKCFjVXFtQRMmyS9Uy5uGEJ6TEr7qq', invitedUsers: 0, totalInvested: 0.9, points: 22.5 },
  { address: 'BGNNdQQwjb4A53cvDryDskAxHK41KJzrtghSiR5SKKVd', invitedUsers: 0, totalInvested: 0.1, points: 3.3 },
  { address: 'AYqMu1N6sSceh1sPfTDRapS2aD1xYiCLN5q2XZH54676', invitedUsers: 0, totalInvested: 0.1, points: 2.4 },
  { address: 'Ab3VCKEfAVfkUuYZHbhbCBLmGnvk5mztUh1tuTgRGM8p', invitedUsers: 0, totalInvested: 0.1, points: 2.4 },
  { address: '6HDRCtwFimMdrzPsEp86HYLEUodK5yz9trjKF5wARKzX', invitedUsers: 0, totalInvested: 0.1, points: 1.6 },
  { address: 'J41p22Y2YNhaqTXnj9HzFvytM5wiumQTm8w8KYVg9Aez', invitedUsers: 0, totalInvested: 0.01, points: 0.25 },
  { address: '7CxGJGveQAtrFuZSawWGCmSZQt1VTTjNDz5zxKbybGYR', invitedUsers: 0, totalInvested: 0.0113, points: 0.25 },
  { address: 'J91QDtyXfsbQDA3ErnzqQqv4G9H1BFzES7eMhGHwfRSH', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'BgUhFPX3vJNcFncj3K3pUz67vPTk7txT7y2mfXFiAhF4', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'BKBoRG7AdvJxrS4kJG31pfrfMuT28ayh6YBE9USGS71a', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'HbaS2KhUVL9reJgSTuPDEW6bkFQsprQzqw3phPqNhSku', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'GNnycAE2kq4uPQu2bJ1D8DsrxfhigR3zcB4T6cPpxLLf', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '8VjgxvvRjMqYQLEyeo6Da2D32W6oAvZtF3wFJssfcp4k', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'Hai2MwNGkXTqhaeyJYzKtA4QJCrZJK4i2yAXkamxe9Jh', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'G6QSAvKhRm1ALgQKXnw36nnoXqUYSupikg3ivrpJ1GVX', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'BgE1KVZ38d16fuUCQ6xD3cHb3AkLHUkzXsUrFXHfs7JA', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '9Ne4nTwsGSjTDF4wAiaBMPSVWxcjgmhqhyVHZBV97JHf', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 's7ia24KsdwohThMdUggD7qrfjwiUT2gs3h55BG4mt2p', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '8gh7KgvuzGm1TUCh2Sa6bWimjJXY5TLyvhipXx8QcCC2', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '9JUMGdpfRk7giFMsWrnQMqomMKKqVGPxkXHiQq6primP', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'DosqHiS7VMjEEfuvUTcpZndTCD9mpB3Mu7A4bk8fNArB', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '4pxU7VSxZoSGS39epvKiY29rW3teTX1rDddieu3wrpEN', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'BSH97ciPCY2XiC6tZKDYMJefmejj8rcBaapPzAqhUTXE', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '3HVofGuVFZbC5uxquQmXxa2n1SUJeMz3VKtcaMZYoRWg', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '6h28hbAJitwXRYumbsBQ2WNBprTVMaP2LTj21gWhDs1i', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '4gpySKwGqEug3Sbr3NXddyFFYFiDh9sJ6Zptr73LXrvP', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '7abaUt3Dq9f9QWfLgKE3M6GR4AEaQBRGRSgB4ccTo6qF', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '7mpHPH6FjmvS6eBQGYGdU5bibnCqXNJiG6BgmbVm8XW', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'GP7sPFhUD5STUKmvcS4h8m3ZYXkSRW55DQiZs1hi1Xss', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'CwctXnCadcpvAHUyrCKc76HUKpjk27Y4sS35MaP8h8RJ', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '2LJTKDYmtF8U1L6s49AfRZALVz7LGLBWwvJ1w3QRf1VF', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '4s1nuYmmG8wK3f4LgVRBQUKZwWwa9HFAhMr5c2HyoDPR', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '83Jh6xrc15Vpg73xTtZ9rxXQtALoh5Q4a3c924sbu3sY', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '2xfqtQyVNHTSCo5PYeJYHRzZqryg7h8kJquMfHmPGfSU', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'HkAcCCbxZhtLc439KqDMC9tGTh2h2VjoSkFtREyQzAqs', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '6EBMq8RE3GKbrz6TP6SixQiQJuDwUC5HGDPy15vWQWWu', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '7PY56r9ZTKWW16ueY6GySddqoVi7Aj6mMD7Ft6nceAdZ', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '7w4iUGrAwDTCptH42Ta35fmC4mL4AhBXgccDxpy8AWay', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'JCGxKzpdCAyLKYsyPCwTXBtQ8KwJvDyWaChpsx94mYpq', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: '9zEJhBFHMWqy6oFzHeGUPgWA87nkv7H7rgq8uL51XD1k', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'EKESZPbqh8DV17nSTTSynGh4gSp2auKyLDzUMJFyt6pQ', invitedUsers: 0, totalInvested: 0, points: 0 },
  { address: 'HRXttfrT85MQYNjdtTABQGBvmND7iDNVfkZnohCmrfRK', invitedUsers: 0, totalInvested: 0, points: 0 },
];

// GET /api/leaderboard?limit=50
// Returns top users ordered by points desc with: address, invitedUsers, totalInvested, points
export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const snapshot = (req.nextUrl.searchParams.get('snapshot') || '').toLowerCase();
    const limit = Math.max(1, Math.min(200, Number(limitParam || 50) || 50));

    // Serve static snapshot if requested
    if (snapshot === 'devnet_snapshot') {
      const rows = DEVNET_SNAPSHOT.slice(0, limit);
      return NextResponse.json({ success: true, data: rows, snapshot: 'devnet_snapshot' });
    }

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
