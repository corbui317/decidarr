import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAuthPin } from '@/lib/services/plex-oauth-factory';
import {
  buildPlexAuthUrl,
  generateOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_PIN_COOKIE,
  OAUTH_PIN_CODE_COOKIE,
  getOAuthCookieOptions,
} from '@/lib/services/plex-oauth';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { enforceRateLimit } from '@/lib/security/rate-limit';

const logger = createLogger('API:PlexAuthStart');

const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
};

export async function POST(request: Request) {
  try {
    const rateLimitResponse = enforceRateLimit(request, 'auth:start', RATE_LIMIT_CONFIG);
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for auth start');
      return rateLimitResponse;
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

    // Validate redirect origin against APP_URL to prevent Host header injection
    let forwardUrl: string | undefined;
    try {
      const requestOrigin = new URL(request.url).origin;
      const appUrl = process.env.APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim();

      if (appUrl) {
        const allowedOrigin = new URL(appUrl).origin;
        if (requestOrigin === allowedOrigin) {
          forwardUrl = `${requestOrigin}/`;
        } else {
          logger.warn('OAuth redirect origin mismatch', {
            requested: requestOrigin,
            allowed: allowedOrigin,
          });
          forwardUrl = undefined;
        }
      } else {
        // No APP_URL configured, omit forwardUrl for safety
        forwardUrl = undefined;
      }
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
