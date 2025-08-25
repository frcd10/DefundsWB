/* POST /api/waitlist  – save email + role (trader | investor) */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { email, role } = await req.json();

  // TODO: persist in your DB or forward to MailerLite, ConvertKit, etc.
  console.log('[waitlist]', role, email);

  return NextResponse.json({ success: true });
}
