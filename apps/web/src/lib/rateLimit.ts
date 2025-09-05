import { NextRequest } from 'next/server';

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blockedUntil?: number;
}

// In-memory store for rate limiting (in production, consider using Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMITS = {
  FIRST_LIMIT: 5 * 60 * 1000,      // 5 minutes
  SECOND_LIMIT: 60 * 60 * 1000,    // 1 hour
  THIRD_LIMIT: 24 * 60 * 60 * 1000, // 24 hours
};

export interface RateLimitResult {
  allowed: boolean;
  timeUntilReset?: number;
  message?: string;
}

export function getRateLimitInfo(req: NextRequest): RateLimitResult {
  const ip = getClientIP(req);
  const now = Date.now();
  
  // Get existing rate limit data for this IP
  let entry = rateLimitStore.get(ip);
  
  if (!entry) {
    // First request from this IP
    entry = {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now,
    };
    rateLimitStore.set(ip, entry);
    return { allowed: true };
  }

  // Check if IP is currently blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    const timeUntilReset = entry.blockedUntil - now;
    const minutes = Math.ceil(timeUntilReset / (1000 * 60));
    const hours = Math.ceil(timeUntilReset / (1000 * 60 * 60));
    
    let message: string;
    if (timeUntilReset < 60 * 60 * 1000) {
      message = `Rate limit exceeded. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
    } else {
      message = `Rate limit exceeded. Please try again in ${hours} hour${hours !== 1 ? 's' : ''}.`;
    }
    
    return {
      allowed: false,
      timeUntilReset,
      message
    };
  }

  // Update attempt count and last attempt time
  entry.attempts += 1;
  entry.lastAttempt = now;

  // Determine if we should block and for how long
  let blockDuration = 0;
  
  if (entry.attempts === 2) {
    // Second attempt: block for 5 minutes
    blockDuration = RATE_LIMITS.FIRST_LIMIT;
  } else if (entry.attempts === 3) {
    // Third attempt: block for 1 hour
    blockDuration = RATE_LIMITS.SECOND_LIMIT;
  } else if (entry.attempts >= 4) {
    // Fourth+ attempt: block for 24 hours
    blockDuration = RATE_LIMITS.THIRD_LIMIT;
  }

  if (blockDuration > 0) {
    entry.blockedUntil = now + blockDuration;
    rateLimitStore.set(ip, entry);
    
    const minutes = Math.ceil(blockDuration / (1000 * 60));
    const hours = Math.ceil(blockDuration / (1000 * 60 * 60));
    
    let message: string;
    if (blockDuration < 60 * 60 * 1000) {
      message = `Rate limit exceeded. You've made too many attempts. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`;
    } else {
      message = `Rate limit exceeded. You've made too many attempts. Please try again in ${hours} hour${hours !== 1 ? 's' : ''}.`;
    }
    
    return {
      allowed: false,
      timeUntilReset: blockDuration,
      message
    };
  }

  // Update the entry in the store
  rateLimitStore.set(ip, entry);
  
  return { allowed: true };
}

function getClientIP(req: NextRequest): string {
  // Try to get IP from various headers (for different proxy setups)
  const forwarded = req.headers.get('x-forwarded-for');
  const realIP = req.headers.get('x-real-ip');
  const remoteAddr = req.headers.get('remote-addr');
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (remoteAddr) {
    return remoteAddr;
  }
  
  // Fallback to a default value
  return 'unknown';
}

// Cleanup function to remove old entries (call periodically)
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [ip, entry] of rateLimitStore.entries()) {
    // Remove entries older than 24 hours that are not currently blocked
    if (!entry.blockedUntil && (now - entry.firstAttempt) > maxAge) {
      rateLimitStore.delete(ip);
    }
    // Remove entries where the block has expired
    else if (entry.blockedUntil && now > entry.blockedUntil) {
      rateLimitStore.delete(ip);
    }
  }
}

// Auto-cleanup every hour
setInterval(cleanupRateLimitStore, 60 * 60 * 1000);
