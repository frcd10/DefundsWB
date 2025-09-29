import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';

// Configuration with sensible defaults & easier overrides
const ENABLED = (process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() === 'true';
const POINTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10); // bump default for dev UX
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // default 15 min

// Routes that are hit frequently (page load metrics) we may want to exempt or soften
// Accept comma-separated list via env: RATE_LIMIT_ALLOWLIST="/health,/api/analytics/overview"
const ALLOWLIST = (process.env.RATE_LIMIT_ALLOWLIST || '/health').split(',').map(r => r.trim()).filter(Boolean);

// Skip limiter entirely in non-production unless explicitly enabled
const isProd = process.env.NODE_ENV === 'production';

// Reusable limiter instance
const limiter = new RateLimiterMemory({
  points: POINTS,
  duration: WINDOW_MS / 1000,
  // blockDuration could be set via env if we want a hard cooldown; leaving default (no block) for smoother dev
});

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Fast path: disabled or allowlisted
  if (!ENABLED || !isProd || ALLOWLIST.some(p => req.path.startsWith(p))) {
    return next();
  }

  const key = req.ip || 'unknown';
  try {
    const rlRes = await limiter.consume(key);
    // Expose basic headers for client debugging / observability
    res.setHeader('X-RateLimit-Limit', String(POINTS));
    res.setHeader('X-RateLimit-Remaining', String(rlRes.remainingPoints));
    res.setHeader('X-RateLimit-Reset', String(Math.round((Date.now() + rlRes.msBeforeNext) / 1000)));
    next();
  } catch (rejRes: any) {
    const secs = Math.max(1, Math.round(rejRes.msBeforeNext / 1000));
    res.setHeader('Retry-After', String(secs));
    res.setHeader('X-RateLimit-Limit', String(POINTS));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.round((Date.now() + rejRes.msBeforeNext) / 1000)));
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: secs,
    });
  }
}
