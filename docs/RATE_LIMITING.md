# Rate Limiting Documentation

## Overview
The waitlist API endpoint (`/api/waitlist`) implements escalating rate limiting to prevent spam and abuse.

## Rate Limit Rules
The system tracks attempts by IP address with the following escalation:

1. **First attempt**: ✅ Allowed
2. **Second attempt**: ❌ Blocked for **5 minutes**
3. **Third attempt**: ❌ Blocked for **1 hour**
4. **Fourth+ attempts**: ❌ Blocked for **24 hours**

## Error Messages
When rate limited, users receive helpful messages:
- "Rate limit exceeded. Please try again in X minutes."
- "Rate limit exceeded. Please try again in X hours."

## Technical Implementation

### Files
- `src/lib/rateLimit.ts` - Rate limiting logic
- `src/app/api/waitlist/route.ts` - API endpoint with rate limit integration
- `src/components/WaitlistModal.tsx` - Frontend with error handling

### IP Detection
The system attempts to get the real IP address from:
1. `x-forwarded-for` header (for proxies)
2. `x-real-ip` header
3. `remote-addr` header
4. Falls back to 'unknown' if none available

### Memory Management
- Rate limit data is stored in memory (Map)
- Automatic cleanup every hour removes expired entries
- Entries are removed after 24 hours of inactivity

## Response Codes
- `200` - Success
- `400` - Bad request (invalid email, missing fields)
- `409` - Conflict (email already registered)
- `429` - Too Many Requests (rate limited)
- `500` - Internal server error

## Production Considerations
For production environments with multiple server instances, consider:
- Using Redis for shared rate limit storage
- Implementing rate limiting at the reverse proxy level (nginx, CloudFlare)
- Adding CAPTCHA for repeated attempts

## Testing Rate Limits
To test the rate limiting:
1. Submit a valid email (should succeed)
2. Submit another email quickly (should be blocked for 5 minutes)
3. Wait 5+ minutes and try again (should be blocked for 1 hour)
4. And so on...

## Environment Variables
Make sure your `.env.local` contains:
```
MONGODB_URI="your_mongodb_connection_string"
```
