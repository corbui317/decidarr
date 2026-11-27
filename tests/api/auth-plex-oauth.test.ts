import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, getTestCookie, setTestCookie } from '../helpers/cookies';
import { seedConfiguredSettings } from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { fakeIntegrations, fakePlexTv, type FakeHandler, type SentRequest } from '../helpers/fake-integrations';

const authLoginMocks = vi.hoisted(() => ({
  completePlexLogin: vi.fn(),
}));

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

let sent: SentRequest[];
const pinPolls = () => sent.filter((r) => r.url.pathname.startsWith('/api/v2/pins/'));

function pollRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe('Plex OAuth API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    ({ sent } = fakeIntegrations(fakePlexTv({ pin: { id: 123, code: 'pin-code' } })));
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
    expect(body).toMatchObject({ pinId: 123, state: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(new URLSearchParams(body.authUrl.split('#?')[1]).get('code')).toBe('pin-code');
    expect(body.authUrl.startsWith('https://app.plex.tv/auth#?')).toBe(true);
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBe(body.state);
    expect(getTestCookie(OAUTH_PIN_COOKIE)).toBe('123');
    expect(getTestCookie(OAUTH_PIN_CODE_COOKIE)).toBe('pin-code');
  });

  it('POST /api/auth/plex/start requires setup secret when configured before setup', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');

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
    expect(pinPolls()).toEqual([]);
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
    expect(pinPolls()).toEqual([]);
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
    expect(pinPolls()).toEqual([]);
  });

  it('GET /api/auth/plex/poll clears cookies and returns expired error for expired pins', async () => {
    await seedConfiguredSettings();
    setTestCookie(OAUTH_PIN_COOKIE, '123');
    setTestCookie(OAUTH_PIN_CODE_COOKIE, 'pin-code');
    setTestCookie(OAUTH_STATE_COOKIE, 'state-abc');
    const plexTv: FakeHandler = fakePlexTv();
    fakeIntegrations((request) =>
      request.url.pathname.startsWith('/api/v2/pins/') ? new Response('gone', { status: 404 }) : plexTv(request)
    );

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll?state=state-abc'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('PLEX_PIN_EXPIRED');
    expect(getTestCookie(OAUTH_PIN_COOKIE)).toBeUndefined();
    expect(getTestCookie(OAUTH_PIN_CODE_COOKIE)).toBeUndefined();
    expect(getTestCookie(OAUTH_STATE_COOKIE)).toBeUndefined();
  });

  it('GET /api/auth/plex/poll also enforces configured setup secret before setup', async () => {
    vi.stubEnv('DECIDARR_SETUP_SECRET', 'expected-setup-secret');
    const settings = await getOrCreateSettings();
    expect(settings.setupComplete).toBe(false);

    const res = await oauthPollGet(pollRequest('http://localhost/api/auth/plex/poll?state=state-abc'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('INVALID_SETUP_SECRET');
    expect(pinPolls()).toEqual([]);
  });
});
