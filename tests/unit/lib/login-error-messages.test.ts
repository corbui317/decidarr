import { describe, it, expect } from 'vitest';
import {
  ApiError,
  PlexLoginError,
  formatPlexLoginError,
  LOGIN_ERROR_MESSAGES,
} from '@/lib/api';
import type { LoginErrorCode } from '@/lib/auth-errors';

const SERVER_TEXT = 'Authentication failed';

describe('formatPlexLoginError', () => {
  const codes = Object.keys(LOGIN_ERROR_MESSAGES) as LoginErrorCode[];

  it('covers every login error code the server sends', () => {
    expect(codes.sort()).toEqual(
      [
        'AUTH_FAILED',
        'INVALID_OAUTH_PIN',
        'INVALID_OAUTH_STATE',
        'INVALID_SETUP_SECRET',
        'LOGIN_FAILED',
        'MISSING_OAUTH_COOKIES',
        'NOT_APPROVED',
        'NO_OWNED_SERVER',
        'NO_SERVER_ACCESS',
        'PLEX_PIN_EXPIRED',
        'PLEX_UNAVAILABLE',
        'RATE_LIMITED',
        'SERVER_MISCONFIGURED',
        'SETUP_SECRET_REQUIRED',
      ].sort()
    );
  });

  it.each(Object.entries(LOGIN_ERROR_MESSAGES))(
    'maps %s from the poll (PlexLoginError) to its own message',
    (code, message) => {
      expect(formatPlexLoginError(new PlexLoginError(SERVER_TEXT, 403, code))).toBe(message);
    }
  );

  it.each(Object.entries(LOGIN_ERROR_MESSAGES))(
    'maps %s from the start route (ApiError) to its own message',
    (code, message) => {
      expect(formatPlexLoginError(new ApiError(SERVER_TEXT, 403, code))).toBe(message);
    }
  );

  it('falls back to the server message for an unknown code', () => {
    expect(formatPlexLoginError(new PlexLoginError('Something specific', 400, 'NEW_CODE'))).toBe(
      'Something specific'
    );
  });

  it('treats a 503 without a code as Plex being unavailable', () => {
    expect(formatPlexLoginError(new PlexLoginError(SERVER_TEXT, 503))).toBe(
      LOGIN_ERROR_MESSAGES.PLEX_UNAVAILABLE
    );
  });
});
