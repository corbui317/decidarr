import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import {
  pollAuthPin,
  OAUTH_PIN_COOKIE,
  OAUTH_PIN_CODE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/services/plex-oauth';
import { completePlexLogin } from '@/lib/auth-login';
import { connectDB } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';

const logger = createLogger('API:PlexAuthPoll');

function clearOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete(OAUTH_PIN_COOKIE);
  cookieStore.delete(OAUTH_PIN_CODE_COOKIE);
  cookieStore.delete(OAUTH_STATE_COOKIE);
}

function statesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const setupCheck = await assertSetupSecretAllowed(request);
    if (!setupCheck.ok) {
      return NextResponse.json(
        { error: setupCheck.error, code: setupCheck.code },
        { status: setupCheck.status }
      );
    }

    const cookieStore = await cookies();
    const pinId = parseInt(cookieStore.get(OAUTH_PIN_COOKIE)?.value || '', 10);
    const pinCode = cookieStore.get(OAUTH_PIN_CODE_COOKIE)?.value || '';
    const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value || '';
    const stateParam = request.nextUrl.searchParams.get('state') || '';

    if (request.nextUrl.searchParams.has('pinId') || request.nextUrl.searchParams.has('code')) {
      return NextResponse.json(
        { error: 'OAuth pin must come from session cookies', code: 'INVALID_OAUTH_PIN' },
        { status: 400 }
      );
    }

    if (!pinId || Number.isNaN(pinId) || !pinCode) {
      return NextResponse.json(
        { error: 'Missing OAuth session. Please start login again.', code: 'MISSING_OAUTH_COOKIES' },
        { status: 400 }
      );
    }

    if (!stateCookie || !stateParam || !statesMatch(stateCookie, stateParam)) {
      clearOAuthCookies(cookieStore);
      return NextResponse.json(
        { error: 'Invalid OAuth state', code: 'INVALID_OAUTH_STATE' },
        { status: 400 }
      );
    }

    const pin = await pollAuthPin(pinId, pinCode);

    if (!pin.authToken) {
      return NextResponse.json({ authorized: false });
    }

    const result = await completePlexLogin(pin.authToken);

    clearOAuthCookies(cookieStore);

    if (!result.success) {
      return NextResponse.json(
        { authorized: true, success: false, error: result.error, code: 'LOGIN_DENIED' },
        { status: result.status || 403 }
      );
    }

    logger.info('Plex OAuth login complete', { username: result.user?.username });
    return NextResponse.json({
      authorized: true,
      success: true,
      user: result.user,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE') {
      return NextResponse.json(
        {
          error: 'Plex.tv is unavailable. Login is temporarily blocked. Please try again later.',
          code: 'PLEX_UNAVAILABLE',
        },
        { status: 503 }
      );
    }
    if (msg === 'PLEX_PIN_EXPIRED' || msg === 'PLEX_PIN_INVALID') {
      const cookieStore = await cookies();
      clearOAuthCookies(cookieStore);
      return NextResponse.json(
        {
          error: 'Plex authorization expired or was invalid. Please try again.',
          code: 'PLEX_PIN_EXPIRED',
        },
        { status: 400 }
      );
    }
    logger.error('Plex poll error', { error: msg });
    return NextResponse.json({ error: 'Login failed', code: 'LOGIN_FAILED' }, { status: 500 });
  }
}
