import 'dotenv/config';
import getClientPromise from '../lib/mongodb';

async function main() {
  const client = await getClientPromise();
  const db = client.db('Defunds');
  const users = db.collection<any>('Users');

  // Reset points and related cached fields
  const res = await users.updateMany({}, {
    $set: {
      points: 0,
      totalInvested: 0,
      lastPointsUpdateAt: null,
    }
  });

  console.log(`Leaderboard reset complete. Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Reset failed:', e);
  process.exit(1);
});
