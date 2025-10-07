import getClientPromise from '../lib/mongodb';

export async function updateHourlyPoints() {
  const client = await getClientPromise();
  const db = client.db('Defunds');
  const users = db.collection<any>('Users');

  const now = new Date();
  // Guard: only run if not already executed this hour (server time). We check a singleton doc.
  const meta = db.collection<any>('Meta');
  const hourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}T${String(now.getUTCHours()).padStart(2,'0')}`;
  const lockId = 'points-hourly-lock';
  const lock = await meta.findOne({ _id: lockId });
  if (lock?.lastRunKey === hourKey) {
    console.log('Points updater: already ran for hour', hourKey);
    return;
  }
  await meta.updateOne(
    { _id: lockId },
    { $set: { lastRunKey: hourKey, updatedAt: now } },
    { upsert: true }
  );

  // Stream through users to avoid loading all in memory in large datasets
  // Only need the wallet (address) and current points value
  const cursor = users.find({}, { projection: { _id: 1, points: 1 } });

  let updated = 0;
  for await (const u of cursor) {
    const address = u._id;

    // Compute invited users live from Users.referredBy to keep in sync with leaderboard
    const invitedUsers = await users.countDocuments({ referredBy: address });

    // Compute total invested live from Funds and Rwa investments (same as leaderboard)
    const [fundsAgg] = await db.collection('Funds').aggregate([
      { $project: { investments: 1 } },
      { $unwind: { path: '$investments', preserveNullAndEmptyArrays: false } },
      { $match: { 'investments.walletAddress': address } },
      { $group: { _id: null, amt: { $sum: { $ifNull: ['$investments.amount', 0] } } } },
    ]).toArray();

    const [rwaAgg] = await db.collection('Rwa').aggregate([
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
            totalInvested, // keep a cached copy for quick reads (source of truth is Funds/Rwa)
          }
        }
      );
      updated += 1;
    } else {
      // still set timestamp to mark we processed
      await users.updateOne(
        { _id: address },
        { $set: { lastPointsUpdateAt: now, invitedUsers, totalInvested }, $setOnInsert: { points: 0 } }
      );
    }
  }

  console.log(`Points updater: processed users=${updated} at ${now.toISOString()} (key ${hourKey})`);
}
