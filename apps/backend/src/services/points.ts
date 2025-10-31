import getClientPromise from '../lib/mongodb';

export async function updateHourlyPoints() {
  const client = await getClientPromise();
  const db = client.db('Defunds');
  const users = db.collection<any>('Users');
  const funds = db.collection<any>('Funds');
  const rwa = db.collection<any>('Rwa');

  const now = new Date();
  // Guard: only run if not already executed this hour (server time). We check a singleton doc.
  const meta = db.collection<any>('Meta');
  const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}`;
  const lockId = 'points-hourly-lock';
  const lock = await meta.findOne({ _id: lockId });
  if (lock?.lastRunKey === hourKey) {
    return;
  }
  await meta.updateOne(
    { _id: lockId },
    { $set: { lastRunKey: hourKey, updatedAt: now } },
    { upsert: true }
  );

  // Build a union of all relevant wallet addresses to ensure full coverage
  const addressSet = new Set<string>();

  // 1) Existing Users
  const userCursor = users.find({}, { projection: { _id: 1 } });
  for await (const u of userCursor) {
    if (u && typeof u._id === 'string') addressSet.add(u._id);
  }

  // 2) From Funds investments (exclude devnet)
  try {
    const fundAddresses: string[] = await funds.distinct('investments.walletAddress', {
      cluster: { $ne: 'devnet' },
      'investments.walletAddress': { $type: 'string' },
    });
    for (const a of fundAddresses) if (a) addressSet.add(a);
  } catch {}

  // 3) From Rwa investments (include docs without cluster or cluster != devnet)
  try {
    const rwaAddresses: string[] = await rwa.distinct('investments.walletAddress', {
      $or: [ { cluster: { $exists: false } }, { cluster: { $ne: 'devnet' } } ],
      'investments.walletAddress': { $type: 'string' },
    });
    for (const a of rwaAddresses) if (a) addressSet.add(a);
  } catch {}

  // Process each address and upsert Users docs so leaderboard includes everyone
  let updated = 0;
  for (const address of addressSet) {
    // Compute invited users live from Users.referredBy
    const invitedUsers = await users.countDocuments({ referredBy: address });

    // Compute total invested live from Funds and Rwa (aligned with leaderboard filters)
    const [fundsAgg] = await funds.aggregate([
      { $match: { cluster: { $ne: 'devnet' } } },
      { $project: { investments: 1 } },
      { $unwind: { path: '$investments', preserveNullAndEmptyArrays: false } },
      { $match: { 'investments.walletAddress': address } },
      { $group: { _id: null, amt: { $sum: { $ifNull: ['$investments.amount', 0] } } } },
    ]).toArray();

    const [rwaAgg] = await rwa.aggregate([
      { $match: { $or: [ { cluster: { $exists: false } }, { cluster: { $ne: 'devnet' } } ] } },
      { $project: { investments: 1 } },
      { $unwind: { path: '$investments', preserveNullAndEmptyArrays: false } },
      { $match: { 'investments.walletAddress': address } },
      { $group: { _id: null, amt: { $sum: { $ifNull: ['$investments.amount', 0] } } } },
    ]).toArray();

    const totalInvested = Number((fundsAgg?.amt || 0) + (rwaAgg?.amt || 0));

    const multiplier = invitedUsers < 5 ? 1 : invitedUsers / 5;
    const increment = totalInvested * multiplier;

    if (increment > 0) {
      await users.updateOne(
        { _id: address },
        {
          $inc: { points: increment },
          $set: {
            lastPointsUpdateAt: now,
            invitedUsers,
            totalInvested,
          },
        },
        { upsert: true }
      );
      updated += 1;
    } else {
      await users.updateOne(
        { _id: address },
        { $set: { lastPointsUpdateAt: now, invitedUsers, totalInvested }, $setOnInsert: { points: 0 } },
        { upsert: true }
      );
    }
  }

  // finished
}
