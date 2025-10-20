import { NextRequest, NextResponse } from 'next/server';

// Deny-list patterns observed from scanners
const DENY_REGEXPS: RegExp[] = [
  /^\/website\.gz(?:$|[/?])/i,
  /^\/(?:backup|backups|back|restore|old)(?:\/|$)/i,
];

// Tiny in-memory rate limiter for HEAD requests (per process, per IP)
const HEAD_WINDOW_MS = Number(process.env.NEXT_HEAD_RL_WINDOW_MS || 10_000); // 10s
const HEAD_LIMIT = Number(process.env.NEXT_HEAD_RL_LIMIT || 60); // 60 req / 10s
type Bucket = { hits: number[] };
const headBuckets: Map<string, Bucket> = new Map();

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  // Fallback to hostname (not ideal, but avoids undefined)
  return req.nextUrl.hostname || 'unknown';
}

function rateLimitHead(ip: string): { allowed: boolean; headers: Record<string, string> } {
  const now = Date.now();
  let b = headBuckets.get(ip);
  if (!b) { b = { hits: [] }; headBuckets.set(ip, b); }
  while (b.hits.length && (now - b.hits[0]) > HEAD_WINDOW_MS) b.hits.shift();
  const remaining = Math.max(0, HEAD_LIMIT - b.hits.length);
  const headers: Record<string, string> = {
    'x-head-ratelimit-limit': String(HEAD_LIMIT),
    'x-head-ratelimit-remaining': String(remaining),
    'x-head-ratelimit-window-ms': String(HEAD_WINDOW_MS),
  };
  if (b.hits.length >= HEAD_LIMIT) {
    const resetIn = HEAD_WINDOW_MS - (now - (b.hits[0] || now));
    headers['retry-after'] = String(Math.ceil(resetIn / 1000));
    return { allowed: false, headers };
  }
  b.hits.push(now);
  return { allowed: true, headers };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // 1) Deny-list for suspicious backup-like paths
  if (DENY_REGEXPS.some((rx) => rx.test(pathname))) {
    return new NextResponse('Gone', { status: 410, headers: { 'cache-control': 'public, max-age=3600' } });
  }

  // 2) Rate-limit HEAD requests
  if (req.method === 'HEAD') {
    const ip = getClientIp(req);
    const rl = rateLimitHead(ip);
    if (!rl.allowed) {
      return new NextResponse('Too Many Requests', { status: 429, headers: rl.headers });
    }
  }

  return NextResponse.next();
}

// Apply to all paths
export const config = {
  matcher: '/:path*',
};
