import dotenv from 'dotenv';
dotenv.config();

import { updateHourlyPoints } from '../services/points';

async function main() {
  const start = new Date();
  console.log(`[points:run] Starting at ${start.toISOString()}`);
  try {
    await updateHourlyPoints();
    const end = new Date();
    console.log(`[points:run] Completed at ${end.toISOString()} in ${Math.round((end.getTime()-start.getTime())/1000)}s`);
    process.exit(0);
  } catch (e) {
    console.error('[points:run] Failed', e);
    process.exit(1);
  }
}

main();
