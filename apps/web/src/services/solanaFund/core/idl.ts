import { Idl } from '@coral-xyz/anchor';

let cachedIdl: Idl | null = null;

export async function loadIdl(): Promise<Idl> {
  if (cachedIdl) return cachedIdl;
  const res = await fetch('/managed_funds.json', { cache: 'no-store' });
  if (!res.ok) {
    const details = `status=${res.status} ${res.statusText}`;
    throw new Error(
      `Failed to load program IDL from /managed_funds.json (${details}). Ensure the file exists at apps/web/public/managed_funds.json (from target/idl/managed_funds.json).`
    );
  }
  const idl = (await res.json()) as Idl;
  cachedIdl = idl;
  return idl;
}
