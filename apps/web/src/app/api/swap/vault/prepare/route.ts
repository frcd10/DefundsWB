import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const bases: string[] = [];
  const envPrimary = (process.env.BACKEND_URL || '').trim();
  const envPublic = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim();
  if (envPrimary) bases.push(envPrimary.replace(/\/$/, ''));
  if (envPublic) bases.push(envPublic.replace(/\/$/, ''));
  // sensible localhost fallbacks for dev
  bases.push('http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:10000', 'http://127.0.0.1:10000');

  const errors: { target: string; message: string }[] = [];
  for (const base of Array.from(new Set(bases))) {
    const target = `${base}/api/swap/vault/prepare`;
    try {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
      });
      const txt = await upstream.text();
      return new NextResponse(txt, {
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
      });
    } catch (e: any) {
      errors.push({ target, message: e?.message || String(e) });
    }
  }
  return NextResponse.json(
    { success: false, error: 'All backend targets failed', details: errors },
    { status: 502 }
  );
}

export function GET() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
