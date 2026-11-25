import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { route } from '@/lib/request/route';
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
import { resolveOAuthForwardUrl } from '@/lib/security/oauth-redirect';

const logger = createLogger('API:PlexAuthStart');

export const POST = route(
  {
    access: 'public',
    rateLimit: { scope: 'auth:start', windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  },
  async ({ request }) => {
    try {
      const setupCheck = await assertSetupSecretAllowed(request);
      if (!setupCheck.ok) {
        return NextResponse.json(
          { error: setupCheck.error, code: setupCheck.code },
          { status: setupCheck.status }
        );
      }

      const state = generateOAuthState();
      const pin = await createAuthPin();

      const forwardUrl = resolveOAuthForwardUrl(request);
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
);
