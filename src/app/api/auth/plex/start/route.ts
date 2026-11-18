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

const logger = createLogger('API:PlexAuthStart');

export async function POST(request: Request) {
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
