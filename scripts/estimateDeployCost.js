#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Connection } = require('@solana/web3.js');

(async () => {
  try {
    const root = process.cwd();
    const soCandidates = [
      path.join(root, 'target', 'deploy', 'managed_funds.so'),
      path.join(root, 'programs', 'managed_funds', 'target', 'deploy', 'managed_funds.so'),
    ];
    let soPath = null;
    for (const p of soCandidates) {
      if (fs.existsSync(p)) { soPath = p; break; }
    }
    if (!soPath) { console.error('Program .so not found'); process.exit(1); }
    const size = fs.statSync(soPath).size; // bytes

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const conn = new Connection(rpcUrl, 'confirmed');

    const programDataRent = await conn.getMinimumBalanceForRentExemption(size);
    const upgradeBufferRent = await conn.getMinimumBalanceForRentExemption(size);
    const total = programDataRent + upgradeBufferRent;

    const toSOL = lamports => lamports / 1_000_000_000;
    console.log(JSON.stringify({
      soPath: path.relative(root, soPath),
      soSizeBytes: size,
      programDataRentLamports: programDataRent,
      upgradeBufferRentLamports: upgradeBufferRent,
      totalRentLamports: total,
      programDataRentSOL: toSOL(programDataRent),
      upgradeBufferRentSOL: toSOL(upgradeBufferRent),
      totalRentSOL: toSOL(total),
      note: 'Excludes tx fees and any additional accounts (e.g., PDAs, mints, ATAs).'
    }, null, 2));
  } catch (e) {
    console.error('Failed to estimate deploy cost:', e.message);
    process.exit(1);
  }
})();
