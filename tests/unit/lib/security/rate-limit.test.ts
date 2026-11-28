import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  clearRateLimitStore,
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

  it('does not evict a freshly-reset entry as if it were still the oldest', () => {
    vi.useFakeTimers();
    try {
      checkRateLimit('A', { windowMs: 10, maxAttempts: 5 }); // oldest insertion, short window
      checkRateLimit('B', { windowMs: 100_000, maxAttempts: 5 }); // second oldest, long window
      checkRateLimit('B', { windowMs: 100_000, maxAttempts: 5 }); // B now has 2 hits recorded

      vi.advanceTimersByTime(20); // A's window has expired; B's has not

      // Restarting A's expired window must make it the newest entry, not leave it in its old,
      // oldest insertion position.
      checkRateLimit('A', { windowMs: 10, maxAttempts: 5 });

      // Fill the store to exactly its bound (A and B already occupy 2 of the slots).
      for (let i = 0; i < RATE_LIMIT_STORE_MAX_ENTRIES - 2; i++) {
        checkRateLimit(`filler-${i}`, { windowMs: 100_000, maxAttempts: 5 });
      }

      // One more hit forces exactly one eviction: the true oldest surviving entry, B.
      checkRateLimit('trigger-eviction', { windowMs: 100_000, maxAttempts: 5 });

      // A survived and keeps counting from its restarted window.
      expect(checkRateLimit('A', { windowMs: 10, maxAttempts: 5 }).remaining).toBe(3);
      // B was evicted, so its count restarts from zero instead of continuing from 2 hits.
      expect(checkRateLimit('B', { windowMs: 100_000, maxAttempts: 5 }).remaining).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a scope\'s global ceiling bucket from being evicted by a flood of distinct identities, while the store stays bounded', () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 1_000_000 };

    // Establish the ceiling bucket first, like a normal early request would.
    expect(isRateLimited(request(), 'flood-scope', policy, 'first-client')).toBe(false);

    // Flood with enough distinct targets to cycle the whole store well past its bound.
    for (let i = 0; i < RATE_LIMIT_STORE_MAX_ENTRIES + 500; i++) {
      isRateLimited(request(), 'flood-scope', policy, `flood-client-${i}`);
    }

    expect(rateLimitStoreSizeForTests()).toBeLessThanOrEqual(RATE_LIMIT_STORE_MAX_ENTRIES);

    // A late distinct client still gets its own fresh bucket (the store stayed usable)...
    expect(isRateLimited(request(), 'flood-scope', policy, 'late-client')).toBe(false);

    // ...and the ceiling bucket kept counting throughout instead of being evicted and restarting.
    const ceiling = checkRateLimit('flood-scope:__global__', { windowMs: 60_000, maxAttempts: 1_000_000 });
    expect(ceiling.remaining).toBeLessThan(1_000_000 - RATE_LIMIT_STORE_MAX_ENTRIES);
  });
});

describe('isRateLimited', () => {
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

  it('applies both the target bucket and the trusted IP bucket, so rotating one cannot dodge the other', () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 1_000 };
    vi.stubEnv('TRUST_PROXY', 'true');

    // Same target, rotating the forwarded IP: the target bucket still catches it.
    expect(isRateLimited(request({ 'x-forwarded-for': '1.1.1.1' }), 'scope-e', policy, 'target-x')).toBe(false);
    expect(isRateLimited(request({ 'x-forwarded-for': '2.2.2.2' }), 'scope-e', policy, 'target-x')).toBe(true);

    // Same forwarded IP, rotating the target: the IP bucket still catches it.
    expect(isRateLimited(request({ 'x-forwarded-for': '3.3.3.3' }), 'scope-e', policy, 'target-y')).toBe(false);
    expect(isRateLimited(request({ 'x-forwarded-for': '3.3.3.3' }), 'scope-e', policy, 'target-z')).toBe(true);
  });

  it('counts a request against the global ceiling only when its own bucket allows it, so one over-limit client cannot starve another', () => {
    const policy = { windowMs: 60_000, maxAttempts: 1, globalMaxAttempts: 3 };

    // client-a's one allowed attempt spends 1 of the 3 shared ceiling slots.
    expect(isRateLimited(request(), 'scope-f', policy, 'client-a')).toBe(false);
    // Every further attempt is rejected by client-a's own bucket and never touches the ceiling.
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(request(), 'scope-f', policy, 'client-a')).toBe(true);
    }

    // An unidentified caller (no target, no trusted IP) only competes for the ceiling, which
    // still has its remaining 2 slots: client-a's flood of rejected attempts did not drain it.
    expect(isRateLimited(request(), 'scope-f', policy)).toBe(false);
    expect(isRateLimited(request(), 'scope-f', policy)).toBe(false);
    expect(isRateLimited(request(), 'scope-f', policy)).toBe(true);
  });
});
