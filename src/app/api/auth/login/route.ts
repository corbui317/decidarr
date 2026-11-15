import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Login');

const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
};

function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
  return `auth:login:${ip}`;
}

/** @deprecated Use POST /api/auth/plex/start instead */
export async function POST(request: Request) {
  const rateLimitKey = getRateLimitKey(request);
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG);

  if (!rateLimit.allowed) {
    logger.warn('Rate limit exceeded for deprecated login', { key: rateLimitKey });
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  return NextResponse.json(
    {
      error: 'Please use Plex OAuth to log in.',
      useOAuth: true,
    },
    { status: 410 }
  );
}
