import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  createAuthPin,
  buildPlexAuthUrl,
  generateOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_PIN_COOKIE,
  OAUTH_PIN_CODE_COOKIE,
  getOAuthCookieOptions,
} from '@/lib/services/plex-oauth';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { checkRateLimit } from '@/lib/security/rate-limit';

const logger = createLogger('API:PlexAuthStart');

const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
};

function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
  return `auth:start:${ip}`;
}

export async function POST(request: Request) {
  try {
    const rateLimitKey = getRateLimitKey(request);
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIG);

    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded for auth start', { key: rateLimitKey });
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }

    const setupCheck = await assertSetupSecretAllowed(request);
    if (!setupCheck.ok) {
      return NextResponse.json(
        { error: setupCheck.error, code: setupCheck.code },
        { status: setupCheck.status }
      );
    }

    const state = generateOAuthState();
    const pin = await createAuthPin();

    let forwardUrl: string | undefined;
    try {
      const origin = new URL(request.url).origin;
      forwardUrl = `${origin}/`;
    } catch {
      forwardUrl = undefined;
    }

    const authUrl = buildPlexAuthUrl(pin.code, { forwardUrl });

    const cookieOptions = getOAuthCookieOptions();
    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, cookieOptions);
    cookieStore.set(OAUTH_PIN_COOKIE, String(pin.id), cookieOptions);
    cookieStore.set(OAUTH_PIN_CODE_COOKIE, pin.code, cookieOptions);

    logger.debug('Plex OAuth started', { pinId: pin.id });
    return NextResponse.json({
      authUrl,
      pinId: pin.id,
      state,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE') {
      return NextResponse.json(
        {
          error: 'Plex.tv is unavailable. Login is temporarily blocked. Please try again later.',
        },
        { status: 503 }
      );
    }
    logger.error('Plex OAuth start failed', { error: msg });
    return NextResponse.json({ error: 'Failed to start Plex login' }, { status: 500 });
  }
}
