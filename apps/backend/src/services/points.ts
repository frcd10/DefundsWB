import getClientPromise from '../lib/mongodb';

export async function updateHourlyPoints() {
  const client = await getClientPromise();
  const db = client.db('Defunds');
  const users = db.collection<any>('Users');

  const now = new Date();

  // Stream through users to avoid loading all in memory in large datasets
  const cursor = users.find({}, { projection: { _id: 1, totalInvested: 1, invitedUsers: 1, points: 1 } });

  let updated = 0;
  for await (const u of cursor) {
    const totalInvested = Number(u.totalInvested || 0);
    const invitedUsers = Number(u.invitedUsers || (Array.isArray(u.invitedList) ? u.invitedList.length : 0) || 0);
    const multiplier = invitedUsers < 5 ? 1 : invitedUsers / 5;
    const increment = totalInvested * multiplier;

    if (increment > 0) {
      await users.updateOne(
        { _id: u._id },
        { $inc: { points: increment }, $set: { lastPointsUpdateAt: now } }
      );
      updated += 1;
    } else {
      // still set timestamp to mark we processed
      await users.updateOne(
        { _id: u._id },
        { $set: { lastPointsUpdateAt: now }, $setOnInsert: { points: 0 } }
      );
    }
  }

  console.log(`Points updater: processed users=${updated} at ${now.toISOString()}`);
}
