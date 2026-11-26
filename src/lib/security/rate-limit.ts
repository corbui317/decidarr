import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { assertTestOnly } from '@/lib/test-only';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** Bounds the store so a flood of distinct keys cannot exhaust memory. */
export const RATE_LIMIT_STORE_MAX_ENTRIES = 10_000;

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
}

export interface RateLimitPolicy extends RateLimitConfig {
  /**
   * Ceiling across every identity for this scope, well above household use, so a flood of
   * distinct identities (or no identity at all) cannot exhaust the limit meant for one.
   * Defaults to `maxAttempts` when omitted.
   */
  globalMaxAttempts?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Get the client IP address for rate limiting.
 * Client-supplied headers are never trusted unless TRUST_PROXY is enabled, because without a
 * trusted reverse proxy in front of it a direct request can set either header to anything,
 * including a fresh value on every request.
 */
export function getClientIp(request: Request): string | null {
  const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase() === 'true';
  if (!trustProxy) return null;

  // The last hop in X-Forwarded-For is the trusted proxy's own view of the client address.
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((ip) => ip.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return request.headers.get('x-real-ip')?.trim() || null;
}

function hashIdentity(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evictOldestIfFull(): void {
  if (store.size < RATE_LIMIT_STORE_MAX_ENTRIES) return;
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) store.delete(oldestKey);
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    evictOldestIfFull();
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
 * Checks a rate-limit policy for one request. A global ceiling for the scope always applies,
 * regardless of identity. Beyond that, the request is also checked against an identity-scoped
 * bucket keyed on `targetId` (what is being attacked: a PIN, a device code, a setup secret)
 * when given, or otherwise the client IP when `TRUST_PROXY` makes it trustworthy. When neither
 * is available, only the global ceiling applies, so an unknown client is never folded into a
 * shared bucket that a handful of failed attempts could use to lock out everyone else.
 */
export function isRateLimited(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  targetId?: string
): boolean {
  const { windowMs, maxAttempts, globalMaxAttempts = policy.maxAttempts } = policy;

  if (!checkRateLimit(`${scope}:__global__`, { windowMs, maxAttempts: globalMaxAttempts }).allowed) {
    return true;
  }

  const identity = targetId ? hashIdentity(targetId) : getClientIp(request);
  if (!identity) return false;

  return !checkRateLimit(`${scope}:${identity}`, { windowMs, maxAttempts }).allowed;
}

/**
 * Shared rate limit enforcement helper.
 * Returns null if allowed, or a 429 NextResponse if rate limited.
 */
export function enforceRateLimit(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  targetId?: string
): NextResponse | null {
  if (!isRateLimited(request, scope, policy, targetId)) return null;

  return NextResponse.json(
    { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
    { status: 429 }
  );
}

/** @internal Test-only: forget every rate-limit bucket. */
export function clearRateLimitStore(): void {
  assertTestOnly('clearRateLimitStore');
  store.clear();
}

/** @internal Test-only: current number of rate-limit buckets. */
export function rateLimitStoreSizeForTests(): number {
  assertTestOnly('rateLimitStoreSizeForTests');
  return store.size;
}
