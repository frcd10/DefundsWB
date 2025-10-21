import dotenv from 'dotenv';
dotenv.config();

import { updateDailyPnl } from '../services/pnl';

async function main() {
  const start = new Date();
  console.log(`[pnl:run] Starting at ${start.toISOString()}`);
  try {
  const res = await updateDailyPnl();
    const end = new Date();
    console.log(`[pnl:run] Completed at ${end.toISOString()} in ${Math.round((end.getTime()-start.getTime())/1000)}s`, res);
    process.exit(0);
  } catch (e) {
    console.error('[pnl:run] Failed', e);
    process.exit(1);
  }
}

main();
