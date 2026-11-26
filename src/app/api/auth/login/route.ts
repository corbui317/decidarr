import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Login');

const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  globalMaxAttempts: 50,
};

/** @deprecated Use POST /api/auth/plex/start instead */
export async function POST(request: Request) {
  const rateLimitResponse = enforceRateLimit(request, 'auth:login', RATE_LIMIT_CONFIG);
  if (rateLimitResponse) {
    logger.warn('Rate limit exceeded for deprecated login');
    return rateLimitResponse;
  }

  return NextResponse.json(
    {
      error: 'Please use Plex OAuth to log in.',
      useOAuth: true,
    },
    { status: 410 }
  );
}
