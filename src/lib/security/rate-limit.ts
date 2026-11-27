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

/** Ceiling bucket keys, so a flood of distinct identity keys can evict a scope's shared ceiling. */
const protectedKeys = new Set<string>();

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
  for (const key of store.keys()) {
    if (protectedKeys.has(key)) continue;
    store.delete(key);
    return;
  }
}

/** Reads the current count for a key without recording a hit, treating an expired or missing entry as zero. */
function peekCount(key: string): number {
  const entry = store.get(key);
  if (!entry || entry.resetAt <= Date.now()) return 0;
  return entry.count;
}

/** Records one hit against a key, starting a fresh window if the entry is missing or expired. */
function recordHit(key: string, windowMs: number): RateLimitEntry {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    evictOldestIfFull();
    const newEntry: RateLimitEntry = { count: 1, resetAt: now + windowMs };
    store.set(key, newEntry);
    return newEntry;
  }
  entry.count += 1;
  store.set(key, entry);
  return entry;
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  if (peekCount(key) >= config.maxAttempts) {
    const entry = store.get(key) as RateLimitEntry;
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  const entry = recordHit(key, config.windowMs);
  return {
    allowed: true,
    remaining: config.maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

function globalCeilingKey(scope: string): string {
  const key = `${scope}:__global__`;
  protectedKeys.add(key);
  return key;
}

/**
 * Checks a rate-limit policy for one request. The request is checked against every identity
 * bucket that is known for it: a bucket keyed on `targetId` (what is being attacked, when it
 * identifies one of many concurrent instances, such as a PIN or a device code) and a bucket
 * keyed on the client IP when `TRUST_PROXY` makes it trustworthy. Both are required, so with
 * TRUST_PROXY enabled a caller cannot dodge its IP bucket by rotating a target it controls.
 * A request already rejected by one of its own identity buckets is never also charged against
 * the scope's global ceiling, so a single over-limit client cannot spend down the ceiling and
 * lock out everyone else; when no identity is known at all, only the ceiling applies.
 */
export function isRateLimited(
  request: Request,
  scope: string,
  policy: RateLimitPolicy,
  targetId?: string
): boolean {
  const { windowMs, maxAttempts, globalMaxAttempts = maxAttempts } = policy;

  const identityKeys: string[] = [];
  if (targetId) identityKeys.push(`${scope}:target:${hashIdentity(targetId)}`);
  const ip = getClientIp(request);
  if (ip) identityKeys.push(`${scope}:ip:${hashIdentity(ip)}`);

  if (identityKeys.some((key) => peekCount(key) >= maxAttempts)) return true;

  const ceilingKey = globalCeilingKey(scope);
  if (peekCount(ceilingKey) >= globalMaxAttempts) return true;

  identityKeys.forEach((key) => recordHit(key, windowMs));
  recordHit(ceilingKey, windowMs);
  return false;
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
  protectedKeys.clear();
}

/** @internal Test-only: current number of rate-limit buckets. */
export function rateLimitStoreSizeForTests(): number {
  assertTestOnly('rateLimitStoreSizeForTests');
  return store.size;
}
