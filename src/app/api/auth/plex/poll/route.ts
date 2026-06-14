import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  pollAuthPin,
  OAUTH_PIN_COOKIE,
  OAUTH_PIN_CODE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/services/plex-oauth';
import { completePlexLogin } from '@/lib/auth-login';
import { connectDB } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:PlexAuthPoll');

function clearOAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete(OAUTH_PIN_COOKIE);
  cookieStore.delete(OAUTH_PIN_CODE_COOKIE);
  cookieStore.delete(OAUTH_STATE_COOKIE);
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const cookieStore = await cookies();
    const pinIdParam = request.nextUrl.searchParams.get('pinId');
    const pinId = pinIdParam
      ? parseInt(pinIdParam, 10)
      : parseInt(cookieStore.get(OAUTH_PIN_COOKIE)?.value || '', 10);

    const pinCode =
      cookieStore.get(OAUTH_PIN_CODE_COOKIE)?.value ||
      request.nextUrl.searchParams.get('code') ||
      '';

    if (!pinId || isNaN(pinId)) {
      return NextResponse.json({ error: 'Invalid pin', code: 'INVALID_PIN' }, { status: 400 });
    }

    if (!pinCode) {
      return NextResponse.json(
        { error: 'Missing authorization code. Please start login again.', code: 'MISSING_CODE' },
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
