import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function backendBases(): string[] {
  const bases: string[] = [];
  const envPrimary = (process.env.BACKEND_URL || '').trim();
  const envPublic = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim();
  if (envPrimary) bases.push(envPrimary.replace(/\/$/, ''));
  if (envPublic) bases.push(envPublic.replace(/\/$/, ''));
  bases.push('http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:10000', 'http://127.0.0.1:10000');
  return Array.from(new Set(bases));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.search;
  const bases = backendBases();
  const errors: { target: string; message: string }[] = [];
  for (const base of bases) {
    const target = `${base}/api/prices${search}`;
    try {
      const upstream = await fetch(target, { cache: 'no-store' });
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
      });
    } catch (e: any) {
      errors.push({ target, message: e?.message || String(e) });
    }
  }
  return NextResponse.json({ error: 'backend-unavailable', details: errors }, { status: 502 });
}

export function POST() {
  return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
