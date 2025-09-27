import { Idl } from '@coral-xyz/anchor';

let cachedIdl: Idl | null = null;

// Optional embedded fallback (keeps a slim subset: address + metadata) so UI can still render basic views
// Replace EMBEDDED_IDL with full JSON if you want completely offline behavior.
// This guards against static hosting / CDN path issues returning 404 for /managed_funds.json.
const EMBEDDED_IDL: Partial<Idl> = {
  // address from current deployed program
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Idl type expects full shape; we only provide minimal fields
  address: '3dHDaKpa5aLMwimWJeBihqwQyyHpR6ky7NNDPtv7QFYt',
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  metadata: { name: 'managed_funds', version: '0.1.0' }
};

export async function loadIdl(): Promise<Idl> {
  if (cachedIdl) return cachedIdl;
  try {
    const res = await fetch('/managed_funds.json', { cache: 'no-store' });
    if (!res.ok) {
      console.warn('[IDL] HTTP', res.status, res.statusText, '— falling back to embedded minimal IDL.');
      if (EMBEDDED_IDL.address) {
        cachedIdl = EMBEDDED_IDL as Idl;
        return cachedIdl;
      }
      throw new Error(`Failed to load program IDL from /managed_funds.json status=${res.status}`);
    }
    const idl = (await res.json()) as Idl;
    cachedIdl = idl;
    return idl;
  } catch (e) {
    console.warn('[IDL] Network error fetching /managed_funds.json:', e);
    if (EMBEDDED_IDL.address) {
      cachedIdl = EMBEDDED_IDL as Idl;
      return cachedIdl;
    }
    throw e;
  }
}

