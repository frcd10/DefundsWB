#!/usr/bin/env node
/**
 * Lightweight JS version of IDL sync. Copies target/idl/managed_funds.json
 * into apps/web/public/managed_funds.json before builds / dev so deploy
 * environment always matches local without manual steps.
 * - Non-fatal if source missing (logs a warning, keeps existing file).
 */
const fs = require('fs');
const path = require('path');

async function run() {
  const root = process.cwd();
  const source = path.join(root, 'target', 'idl', 'managed_funds.json');
  const destDir = path.join(root, 'apps', 'web', 'public');
  const dest = path.join(destDir, 'managed_funds.json');
  try {
    await fs.promises.mkdir(destDir, { recursive: true });
    const raw = await fs.promises.readFile(source, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.address && parsed.metadata && parsed.metadata.address) {
      parsed.address = parsed.metadata.address;
    }
    await fs.promises.writeFile(dest, JSON.stringify(parsed, null, 2));
    console.log(`[sync-idl] Updated IDL -> ${path.relative(root, dest)}`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn('[sync-idl] Source IDL not found, keeping existing public file (if any).');
      return; // do not fail
    }
    console.warn('[sync-idl] Non-fatal error:', e.message);
  }
}

run();
