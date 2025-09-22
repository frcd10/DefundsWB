import { NextResponse } from 'next/server';

// Helper API route to serve IDL from various locations for robustness in dev
export async function GET() {
  const candidates = [
    '/managed_funds.json',
    process.env.NEXT_PUBLIC_IDL_URL || '',
  ].filter(Boolean) as string[];

  for (const url of candidates) {
    try {
      // For absolute URLs, fetch directly; for relative, fetch via internal request
      const isAbsolute = /^https?:\/\//i.test(url);
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const idl = await res.json();
        return NextResponse.json(idl);
      }
    } catch (e) {
      // ignore and try next
    }
  }

  return NextResponse.json({ error: 'IDL not found. Place managed_funds.json in apps/web/public or set NEXT_PUBLIC_IDL_URL.' }, { status: 404 });
}
