import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeUrl,
  isAuthError,
  authErrorStatus,
  SessionError,
  getPlexCredentials,
  validateSession,
  requireUser,
} from '@/lib/auth';
import { clearDatabase } from '../../helpers/mongo';
import { createModernSessionToken, seedConfiguredSettings, seedTestUser } from '../../helpers/auth';
import { setTestCookie, setTestHeader, clearTestCookies, clearTestHeaders } from '../../helpers/cookies';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';

describe('normalizeUrl', () => {
  it('adds http protocol when missing', () => {
    expect(normalizeUrl('192.168.1.10:32400')).toBe('http://192.168.1.10:32400');
  });

  it('preserves https and strips trailing slashes', () => {
    expect(normalizeUrl('https://plex.example.com/')).toBe('https://plex.example.com');
  });

  it('returns empty string unchanged', () => {
    expect(normalizeUrl('')).toBe('');
  });
});

describe('isAuthError', () => {
  it('recognizes session errors by type, not by message text', () => {
    expect(isAuthError(new SessionError('UNAUTHORIZED'))).toBe(true);
    expect(isAuthError(new SessionError('APP_NOT_CONFIGURED'))).toBe(true);
    expect(isAuthError(new Error('Unauthorized'))).toBe(false);
    expect(isAuthError(new Error('Something else'))).toBe(false);
  });

  it('maps each session error code to its status', () => {
    expect(authErrorStatus(new SessionError('UNAUTHORIZED'))).toBe(401);
    expect(authErrorStatus(new SessionError('APP_NOT_CONFIGURED'))).toBe(401);
    expect(authErrorStatus(new SessionError('FORBIDDEN'))).toBe(403);
    expect(authErrorStatus(new Error('boom'))).toBe(500);
  });
});

describe('getPlexCredentials and validateSession', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearTestHeaders();
  });

  it('returns the session Plex credentials for a valid cookie session', async () => {
    await seedConfiguredSettings();
    const user = await seedTestUser();
    setTestCookie('decidarr_session', await createModernSessionToken(user));

    const creds = await getPlexCredentials();
    expect(creds.plexToken).toBeTruthy();
    expect(creds.plexServerUrl).toBe('http://192.168.1.10:32400');
    expect(creds.plexUsername).toBe(user.plexUsername);
    expect(await validateSession()).toBe(true);
  });

  it('returns nulls and false when there is no session', async () => {
    await seedConfiguredSettings();

    const creds = await getPlexCredentials();
    expect(creds).toEqual({ plexToken: null, plexServerUrl: null, plexUsername: null });
    expect(await validateSession()).toBe(false);
  });
});

describe('requireUser with a bearer Authorization header', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearTestHeaders();
  });

  it('authenticates from a valid bearer access token, not the cookie', async () => {
    await seedConfiguredSettings();
    const user = await seedTestUser();
    const tokens = await issueTokenPair(user, 'device-1');
    setTestHeader('authorization', `Bearer ${tokens.accessToken}`);

    const ctx = await requireUser();
    expect(ctx.user._id.toString()).toBe(user._id.toString());
  });

  it('falls back to the cookie session when the bearer header is malformed', async () => {
    await seedConfiguredSettings();
    const user = await seedTestUser();
    setTestHeader('authorization', 'not-a-bearer-header');
    setTestCookie('decidarr_session', await createModernSessionToken(user));

    const ctx = await requireUser();
    expect(ctx.user._id.toString()).toBe(user._id.toString());
  });

  it('falls back to the cookie session when the bearer token does not verify', async () => {
    await seedConfiguredSettings();
    const user = await seedTestUser();
    setTestHeader('authorization', 'Bearer not-a-real-token');
    setTestCookie('decidarr_session', await createModernSessionToken(user));

    const ctx = await requireUser();
    expect(ctx.user._id.toString()).toBe(user._id.toString());
  });
});
