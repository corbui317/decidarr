import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  seedConfiguredSettings,
} from '../helpers/auth';
import { getTestCookie, setTestCookie } from '../helpers/cookies';
import jwt from 'jsonwebtoken';
import { clearDatabase } from '../helpers/mongo';
import { User } from '@/lib/models/User';
import { deriveKey } from '@/lib/secrets';
import {
  fakeIntegrations,
  plexSections,
  routes,
  TEST_PLEX_SERVER,
  type SentRequest,
} from '../helpers/fake-integrations';

import { POST as refreshPost } from '@/app/api/auth/refresh/route';
import { DELETE as logoutDelete } from '@/app/api/auth/logout/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { GET as sectionsGet } from '@/app/api/library/sections/route';

describe('Auth session API routes', () => {
  let serverAccepts: boolean;
  let sent: SentRequest[];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    serverAccepts = true;
    ({ sent } = fakeIntegrations(
      routes({
        [`${TEST_PLEX_SERVER}/library/sections`]: () =>
          serverAccepts
            ? plexSections([{ id: '1', title: 'Movies', type: 'movie' }])
            : new Response('unauthorized', { status: 401 }),
      })
    ));
  });

  it('refreshes a valid session and reissues the session cookie', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();

    const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(getTestCookie('decidarr_session')).toBeTruthy();
    expect(sent.map((r) => [r.url.pathname, r.headers.get('X-Plex-Token')])).toEqual([
      ['/library/sections', 'test-plex-token-abcdefghijklmnop'],
    ]);

    const refreshed = await User.findById(user._id);
    expect(refreshed?.tokenValidatedAt).toBeInstanceOf(Date);
  });

  it('asks the user to sign in again when the Plex server refuses their token during refresh', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    serverAccepts = false;

    const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('PLEX_SIGN_IN_REQUIRED');
    expect(body.error).toMatch(/sign in again/i);
  });

  it('returns 401 when refresh is requested without a session', async () => {
    await seedConfiguredSettings();

    const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(sent).toEqual([]);
  });

  it('never includes the Plex server URL in the response (spec #18 story 30)', async () => {
    await seedConfiguredSettings({ plexServerUrl: 'http://internal-plex.example:32400' });
    await authenticateTestSession();

    const res = await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('internal-plex.example');
    expect(JSON.parse(text).user).not.toHaveProperty('serverUrl');
  });

  it('clears the session cookie on logout', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const res = await logoutDelete(createJsonRequest('http://localhost/api/auth/logout', 'DELETE'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe('Logged out successfully');
    expect(getTestCookie('decidarr_session')).toBeUndefined();
  });

  it('rejects a session cookie captured before logout, after logout (M3)', async () => {
    await seedConfiguredSettings();
    const { token } = await authenticateTestSession();
    // Simulates an attacker (or another tab) holding a copy of the cookie from before
    // this browser's own logout call clears it.
    const capturedCookie = token;

    const res = await logoutDelete(createJsonRequest('http://localhost/api/auth/logout', 'DELETE'));
    expect(res.status).toBe(200);

    setTestCookie('decidarr_session', capturedCookie);
    const meRes = await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'));

    expect(meRes.status).toBe(401);
    expect(await meRes.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
  });

  it('bumps the session version on logout even when the Plex server token is refused or unreadable', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();
    // The full Session seam (resolveSession) would throw PLEX_SIGN_IN_REQUIRED here;
    // logout must still revoke the session on identity alone.
    await User.updateOne({ _id: user._id }, { $unset: { plexServerToken: 1 } });

    const res = await logoutDelete(createJsonRequest('http://localhost/api/auth/logout', 'DELETE'));
    expect(res.status).toBe(200);

    const revoked = await User.findById(user._id);
    expect(revoked?.sessionVersion).toBe(1);
  });

  it('rejects a cross-origin logout request and does not revoke the session', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();

    const res = await logoutDelete(
      new Request('http://localhost/api/auth/logout', {
        method: 'DELETE',
        headers: { Origin: 'https://evil.example' },
      })
    );

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FORBIDDEN');
    const untouched = await User.findById(user._id);
    expect(untouched?.sessionVersion).toBe(0);
    expect(getTestCookie('decidarr_session')).toBeTruthy();
  });

  it('does not report a successful logout when revoking the session fails', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();
    const findByIdAndUpdate = vi
      .spyOn(User, 'findByIdAndUpdate')
      .mockRejectedValueOnce(new Error('database unavailable'));

    const res = await logoutDelete(createJsonRequest('http://localhost/api/auth/logout', 'DELETE'));
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(body.message).not.toBe('Logged out successfully');
    const untouched = await User.findById(user._id);
    expect(untouched?.sessionVersion).toBe(0);

    findByIdAndUpdate.mockRestore();
  });

  it('does not report a successful logout when looking up the user fails', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();
    // A database failure resolving identity, not a session problem: the credential
    // itself is perfectly valid, so this must not be treated as "nothing to revoke".
    const findById = vi.spyOn(User, 'findById').mockRejectedValueOnce(new Error('database unavailable'));

    const res = await logoutDelete(createJsonRequest('http://localhost/api/auth/logout', 'DELETE'));
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(body.message).not.toBe('Logged out successfully');
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    findById.mockRestore();
    const untouched = await User.findById(user._id);
    expect(untouched?.sessionVersion).toBe(0);
  });

  it('refuses to refresh a web session older than 30 days from sign-in', async () => {
    await seedConfiguredSettings();
    const THIRTY_ONE_DAYS_AGO = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await authenticateTestSession({ signedInAt: THIRTY_ONE_DAYS_AGO });

    const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
  });

  it('still refreshes a web session within its 30-day absolute lifetime', async () => {
    await seedConfiguredSettings();
    const TWENTY_NINE_DAYS_AGO = Date.now() - 29 * 24 * 60 * 60 * 1000;
    await authenticateTestSession({ signedInAt: TWENTY_NINE_DAYS_AGO });

    const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));
    expect(res.status).toBe(200);
  });

  it('signs a pre-upgrade cookie (no signedInAt claim) out once, rather than guess its age', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();
    const legacyToken = jwt.sign(
      { sub: user._id.toString(), plexUserId: user.plexUserId, isAdmin: user.isAdmin, sessionVersion: user.sessionVersion },
      // Signed the same way issueSessionCookie would have before this change (no signedInAt field).
      deriveKey('web-session'),
      { expiresIn: '7d' }
    );
    setTestCookie('decidarr_session', legacyToken);

    const res = await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'));
    expect(res.status).toBe(401);
  });

  describe('a session cookie the server cannot verify', () => {
    async function setForeignSessionCookie(options: jwt.SignOptions = {}) {
      await seedConfiguredSettings();
      const { user } = await authenticateTestSession();
      // Signed with a key this server does not hold, e.g. issued before a DECIDARR_SECRET change.
      const token = jwt.sign(
        { sub: user._id.toString(), plexUserId: user.plexUserId, isAdmin: user.isAdmin, sessionVersion: user.sessionVersion },
        'some-other-jwt-secret',
        options
      );
      setTestCookie('decidarr_session', token);
    }

    it('GET /api/auth/me answers 401, not 500', async () => {
      await setForeignSessionCookie();
      const res = await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    });

    it('POST /api/auth/refresh answers 401 for a session the server cannot verify', async () => {
      await setForeignSessionCookie();
      const res = await refreshPost(createJsonRequest('http://localhost/api/auth/refresh', 'POST'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    });

    it('a protected route answers 401 for an expired session', async () => {
      await setForeignSessionCookie({ expiresIn: -10 });
      const res = await sectionsGet(new NextRequest('http://localhost/api/library/sections'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    });
  });
});
