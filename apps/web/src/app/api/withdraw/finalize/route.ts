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

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const bases = backendBases();
    const errors: { target: string; message: string }[] = [];
    for (const base of bases) {
      const target = `${base}/api/withdraw/finalize`;
      try {
        const upstream = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: bodyText });
        const txt = await upstream.text();
        return new NextResponse(txt, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' } });
      } catch (e: any) {
        errors.push({ target, message: e?.message || String(e) });
      }
    }
    return NextResponse.json({ success: false, error: 'backend-unavailable', details: errors }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: 'proxy-error', details: e?.message || String(e) }, { status: 500 });
  }
}

export function GET() { return NextResponse.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 }); }
