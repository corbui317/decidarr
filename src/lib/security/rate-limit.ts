import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Get the client IP address for rate limiting.
 * Uses socket IP by default, or the last trusted hop from X-Forwarded-For
 * only when TRUST_PROXY environment variable is set.
 */
export function getClientIp(request: Request): string {
  const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase() === 'true';

  if (trustProxy) {
    // When behind a trusted proxy, use the last hop in X-Forwarded-For
    // (the last proxy that the app trusts, which added the client's real IP)
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const hops = forwarded.split(',').map(ip => ip.trim());
      // Use the last hop (closest to the app server)
      return hops[hops.length - 1] || 'unknown';
    }
  }

  // Default: use socket IP from X-Real-IP or fall back to 'unknown'
  // In production with a reverse proxy, this should be the proxy's IP
  return request.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= config.maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  store.set(key, entry);

  return {
    allowed: true,
    remaining: config.maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Shared rate limit enforcement helper.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  config: RateLimitConfig
): NextResponse | null {
  const ip = getClientIp(request);
  const key = `${scope}:${ip}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  return null;
}

export function clearRateLimitStore(): void {
  store.clear();
}
