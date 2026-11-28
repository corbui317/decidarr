import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { plexLoginPollResponseSchema, plexPollQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import {
  pollAuthPin,
  OAUTH_PIN_COOKIE,
  OAUTH_PIN_CODE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/services/plex-oauth';
import { completePlexLogin } from '@/lib/auth-login';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { isRateLimited } from '@/lib/security/rate-limit';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:PlexAuthPoll');

// Per-pin rate limit: allow ~300 polls over 10 minutes (polling every 2s)
// This prevents infinite polling but doesn't block users who take time on plex.tv
// globalMaxAttempts bounds total polling across every pin, well above household use.
const POLL_RATE_LIMIT_CONFIG = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxAttempts: 300, // ~one poll every 2 seconds
  globalMaxAttempts: 5_000,
};

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

export const GET = route(
  { access: 'public', query: plexPollQuerySchema, response: plexLoginPollResponseSchema },
  async ({ request, query, reply }) => {
    try {
      const setupCheck = await assertSetupSecretAllowed(request);
      if (!setupCheck.ok) {
        return errorReply(setupCheck.status, { error: setupCheck.error, code: setupCheck.code });
      }

      const cookieStore = await cookies();
      const pinId = parseInt(cookieStore.get(OAUTH_PIN_COOKIE)?.value || '', 10);
      const pinCode = cookieStore.get(OAUTH_PIN_CODE_COOKIE)?.value || '';
      const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value || '';
      const url = new URL(request.url);
      const stateParam = query.state || '';

      if (url.searchParams.has('pinId') || url.searchParams.has('code')) {
        return errorReply(400, { error: 'OAuth pin must come from session cookies', code: 'INVALID_OAUTH_PIN' });
      }

      if (!pinId || Number.isNaN(pinId) || !pinCode) {
        return errorReply(400, { error: 'Missing OAuth session. Please start login again.', code: 'MISSING_OAUTH_COOKIES' });
      }

      // Rate limit by pin to prevent excessive polling for a single login session
      // This allows users to take their time on plex.tv without getting locked out
      const limited = isRateLimited(request, 'auth:poll', POLL_RATE_LIMIT_CONFIG, `pin:${pinId}`);

      if (limited) {
        logger.warn('Rate limit exceeded for OAuth pin polling', { pinId });
        clearOAuthCookies(cookieStore);
        return errorReply(429, {
          error: 'Login session expired due to excessive polling. Please try again.',
          code: 'RATE_LIMITED',
        });
      }

      if (!stateCookie || !stateParam || !statesMatch(stateCookie, stateParam)) {
        clearOAuthCookies(cookieStore);
        return errorReply(400, { error: 'Invalid OAuth state', code: 'INVALID_OAUTH_STATE' });
      }

      const pin = await pollAuthPin(pinId, pinCode);

      if (!pin.authToken) {
        return reply({ authorized: false });
      }

      const result = await completePlexLogin(pin.authToken);

      clearOAuthCookies(cookieStore);

      if (!result.success) {
        return errorReply(result.status || 403, {
          error: result.error ?? 'Login failed',
          code: result.code || 'AUTH_FAILED',
        });
      }

      logger.info('Plex OAuth login complete', { username: result.user?.username });
      return reply({ authorized: true, success: true, user: result.user });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PLEX_UNAVAILABLE') {
        return errorReply(503, {
          error: 'Plex.tv is unavailable. Login is temporarily blocked. Please try again later.',
          code: 'PLEX_UNAVAILABLE',
        });
      }
      if (msg === 'PLEX_PIN_EXPIRED' || msg === 'PLEX_PIN_INVALID') {
        const cookieStore = await cookies();
        clearOAuthCookies(cookieStore);
        return errorReply(400, {
          error: 'Plex authorization expired or was invalid. Please try again.',
          code: 'PLEX_PIN_EXPIRED',
        });
      }
      logger.error('Plex poll error', { error: msg });
      return errorReply(500, { error: 'Login failed', code: 'LOGIN_FAILED' });
    }
  }
);
