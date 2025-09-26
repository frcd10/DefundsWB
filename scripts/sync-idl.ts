#!/usr/bin/env ts-node
/**
 * Sync the latest Anchor-generated IDL for managed_funds into the web app's public directory
 * so the frontend always loads the correct account + instruction names.
 */
import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  const root = process.cwd();
  const source = path.join(root, 'target', 'idl', 'managed_funds.json');
  const destDir = path.join(root, 'apps', 'web', 'public');
  const dest = path.join(destDir, 'managed_funds.json');
  try {
    await fs.mkdir(destDir, { recursive: true });
    const buf = await fs.readFile(source);
    const parsed = JSON.parse(buf.toString());
    // Ensure address field present (Anchor 0.29 adds metadata.address sometimes)
    if (!parsed.address && parsed.metadata?.address) {
      parsed.address = parsed.metadata.address;
    }
    await fs.writeFile(dest, JSON.stringify(parsed, null, 2));
    console.log(`[sync-idl] Copied ${source} -> ${dest}`);
  } catch (e) {
    console.error('[sync-idl] Failed:', (e as Error).message);
    process.exit(1);
  }
}

main();
