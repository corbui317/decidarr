import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, getTestCookie, setTestCookie } from '../helpers/cookies';
import { seedConfiguredSettings } from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';

const plexOAuthMocks = vi.hoisted(() => ({
  createAuthPin: vi.fn(),
  buildPlexAuthUrl: vi.fn(),
  generateOAuthState: vi.fn(),
  pollAuthPin: vi.fn(),
}));

const authLoginMocks = vi.hoisted(() => ({
  completePlexLogin: vi.fn(),
}));

vi.mock('@/lib/services/plex-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/plex-oauth')>();
  return {
    ...actual,
    createAuthPin: plexOAuthMocks.createAuthPin,
    buildPlexAuthUrl: plexOAuthMocks.buildPlexAuthUrl,
    generateOAuthState: plexOAuthMocks.generateOAuthState,
    pollAuthPin: plexOAuthMocks.pollAuthPin,
  };
});

vi.mock('@/lib/auth-login', () => ({
  completePlexLogin: authLoginMocks.completePlexLogin,
}));

import { POST as oauthStartPost } from '@/app/api/auth/plex/start/route';
import { GET as oauthPollGet } from '@/app/api/auth/plex/poll/route';
import {
  OAUTH_PIN_CODE_COOKIE,
  OAUTH_PIN_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/services/plex-oauth';

function pollRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe('Plex OAuth API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    plexOAuthMocks.createAuthPin.mockResolvedValue({ id: 123, code: 'pin-code' });
    plexOAuthMocks.buildPlexAuthUrl.mockReturnValue('https://app.plex.tv/auth#?code=pin-code');
    plexOAuthMocks.generateOAuthState.mockReturnValue('state-abc');
    plexOAuthMocks.pollAuthPin.mockResolvedValue({ id: 123, code: 'pin-code' });
    authLoginMocks.completePlexLogin.mockResolvedValue({
      success: true,
      user: { id: 'user-1', username: 'testuser', serverUrl: 'http://192.168.1.10:32400', isAdmin: true },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/auth/plex/start sets state and pin cookies', async () => {
    await seedConfiguredSettings();

    const res = await oauthStartPost(new Request('http://localhost/api/auth/plex/start', { method: 'POST' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      authUrl: 'https://app.plex.tv/auth#?code=pin-code',
      pinId: 123,
      state: 'state-abc',
    });
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBe('state-abc');
    expect(getTestCookie(OAUTH_PIN_COOKIE)).toBe('123');
    expect(getTestCookie(OAUTH_PIN_CODE_COOKIE)).toBe('pin-code');
  });

  it('POST /api/auth/plex/start requires setup secret when configured before setup', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-secret');

    const res = await oauthStartPost(new Request('http://localhost/api/auth/plex/start', { method: 'POST' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('INVALID_SETUP_SECRET');
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
  });

  it('GET /api/auth/plex/poll rejects missing state', async () => {
    await seedConfiguredSettings();
    setTestCookie(OAUTH_PIN_COOKIE, '123');
    setTestCookie(OAUTH_PIN_CODE_COOKIE, 'pin-code');
    setTestCookie(OAUTH_STATE_COOKIE, 'state-abc');

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_OAUTH_STATE');
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
    expect(plexOAuthMocks.pollAuthPin).not.toHaveBeenCalled();
  });

  it('GET /api/auth/plex/poll rejects invalid state', async () => {
    await seedConfiguredSettings();
    setTestCookie(OAUTH_PIN_COOKIE, '123');
    setTestCookie(OAUTH_PIN_CODE_COOKIE, 'pin-code');
    setTestCookie(OAUTH_STATE_COOKIE, 'state-abc');

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll?state=wrong'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_OAUTH_STATE');
    expect(getTestCookie(OAUTH_PIN_COOKIE)).toBeUndefined();
    expect(plexOAuthMocks.pollAuthPin).not.toHaveBeenCalled();
  });

  it('GET /api/auth/plex/poll rejects pin values not bound to cookies', async () => {
    await seedConfiguredSettings();
    setTestCookie(OAUTH_PIN_COOKIE, '123');
    setTestCookie(OAUTH_PIN_CODE_COOKIE, 'pin-code');
    setTestCookie(OAUTH_STATE_COOKIE, 'state-abc');

    const res = await oauthPollGet(
      pollRequest('http://localhost/api/auth/plex/poll?state=state-abc&pinId=456')
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_OAUTH_PIN');
    expect(plexOAuthMocks.pollAuthPin).not.toHaveBeenCalled();
  });

  it('GET /api/auth/plex/poll clears cookies and returns expired error for expired pins', async () => {
    await seedConfiguredSettings();
    setTestCookie(OAUTH_PIN_COOKIE, '123');
    setTestCookie(OAUTH_PIN_CODE_COOKIE, 'pin-code');
    setTestCookie(OAUTH_STATE_COOKIE, 'state-abc');
    plexOAuthMocks.pollAuthPin.mockRejectedValue(new Error('PLEX_PIN_EXPIRED'));

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll?state=state-abc'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('PLEX_PIN_EXPIRED');
    expect(getTestCookie(OAUTH_PIN_COOKIE)).toBeUndefined();
    expect(getTestCookie(OAUTH_PIN_CODE_COOKIE)).toBeUndefined();
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
  });

  it('GET /api/auth/plex/poll also enforces configured setup secret before setup', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-secret');
    const settings = await getOrCreateSettings();
    expect(settings.setupComplete).toBe(false);

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll?state=state-abc'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('INVALID_SETUP_SECRET');
    expect(plexOAuthMocks.pollAuthPin).not.toHaveBeenCalled();
  });
});
