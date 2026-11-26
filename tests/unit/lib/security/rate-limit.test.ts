import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  clearRateLimitStore,
  enforceRateLimit,
  getClientIp,
  isRateLimited,
  rateLimitStoreSizeForTests,
  RATE_LIMIT_STORE_MAX_ENTRIES,
} from '@/lib/security/rate-limit';

function request(headers?: Record<string, string>): Request {
  return new Request('http://localhost/', { headers });
}

describe('getClientIp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ignores X-Forwarded-For and X-Real-IP when TRUST_PROXY is unset', () => {
    const req = request({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' });
    expect(getClientIp(req)).toBeNull();
  });

  it('ignores both headers when TRUST_PROXY is explicitly false', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const req = request({ 'x-real-ip': '5.6.7.8' });
    expect(getClientIp(req)).toBeNull();
  });

  it('uses the last hop of X-Forwarded-For when TRUST_PROXY is enabled', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    const req = request({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('falls back to X-Real-IP when TRUST_PROXY is enabled and there is no X-Forwarded-For', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    const req = request({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('returns null when TRUST_PROXY is enabled but no client-identifying header is sent', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    expect(getClientIp(request())).toBeNull();
  });
});

describe('checkRateLimit store bound', () => {
  afterEach(() => {
    clearRateLimitStore();
  });

  it('evicts the oldest entry once the store exceeds its size bound', () => {
    for (let i = 0; i < RATE_LIMIT_STORE_MAX_ENTRIES + 5; i++) {
      checkRateLimit(`key-${i}`, { windowMs: 60_000, maxAttempts: 5 });
    }

    expect(rateLimitStoreSizeForTests()).toBeLessThanOrEqual(RATE_LIMIT_STORE_MAX_ENTRIES);
    // The earliest keys were evicted, so hitting them again starts a fresh bucket.
    expect(checkRateLimit('key-0', { windowMs: 60_000, maxAttempts: 5 }).remaining).toBe(4);
  });
});

describe('isRateLimited / enforceRateLimit', () => {
  afterEach(() => {
    clearRateLimitStore();
    vi.unstubAllEnvs();
  });

  it('does not share a bucket across unknown clients: one client exhausting its limit does not block another', () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 1_000 };

    // Same target, two attempts: the second is limited.
    expect(isRateLimited(request(), 'scope-a', policy, 'client-a')).toBe(false);
    expect(isRateLimited(request(), 'scope-a', policy, 'client-a')).toBe(true);

    // A different target is unaffected.
    expect(isRateLimited(request(), 'scope-a', policy, 'client-b')).toBe(false);
  });

  it('applies the forwarded IP as identity only when TRUST_PROXY is enabled', () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 1_000 };
    vi.stubEnv('TRUST_PROXY', 'true');

    expect(isRateLimited(request({ 'x-forwarded-for': '1.1.1.1' }), 'scope-b', policy)).toBe(false);
    expect(isRateLimited(request({ 'x-forwarded-for': '1.1.1.1' }), 'scope-b', policy)).toBe(true);
    // A different forwarded IP gets its own bucket.
    expect(isRateLimited(request({ 'x-forwarded-for': '2.2.2.2' }), 'scope-b', policy)).toBe(false);
  });

  it('enforces a global ceiling across every identity for the scope', () => {
    const policy = { windowMs: 60_000, maxAttempts: 100, globalMaxAttempts: 3 };

    // No TRUST_PROXY and no targetId: no identity bucket exists, so only the global ceiling applies.
    expect(isRateLimited(request(), 'scope-c', policy)).toBe(false);
    expect(isRateLimited(request(), 'scope-c', policy)).toBe(false);
    expect(isRateLimited(request(), 'scope-c', policy)).toBe(false);
    expect(isRateLimited(request(), 'scope-c', policy)).toBe(true);
  });

  it('enforceRateLimit returns the shared rate-limited error code', async () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 1_000 };
    expect(enforceRateLimit(request(), 'scope-d', policy, 'client')).toBeNull();

    const response = enforceRateLimit(request(), 'scope-d', policy, 'client');
    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    });
  });
});
