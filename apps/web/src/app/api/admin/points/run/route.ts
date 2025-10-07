import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const res = await fetch(`${backendUrl}/api/admin/points/run`, { method: 'POST' });
    const ok = res.ok;
    return NextResponse.json({ success: ok });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
