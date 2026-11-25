import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  authenticateTestSession,
  clearTestCookies,
  seedConfiguredSettings,
} from '../helpers/auth';
import { getTestCookie, setTestCookie } from '../helpers/cookies';
import jwt from 'jsonwebtoken';
import { clearDatabase } from '../helpers/mongo';
import { User } from '@/lib/models/User';

const plexMock = vi.hoisted(() => ({
  validateToken: vi.fn(),
}));

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

import { POST as refreshPost } from '@/app/api/auth/refresh/route';
import { DELETE as logoutDelete } from '@/app/api/auth/logout/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { GET as sectionsGet } from '@/app/api/library/sections/route';

describe('Auth session API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    plexMock.validateToken.mockResolvedValue({ valid: true });
  });

  it('refreshes a valid session and reissues the session cookie', async () => {
    await seedConfiguredSettings();
    const { user } = await authenticateTestSession();

    const res = await refreshPost();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(getTestCookie('decidarr_session')).toBeTruthy();
    expect(plexMock.validateToken).toHaveBeenCalled();

    const refreshed = await User.findById(user._id);
    expect(refreshed?.tokenValidatedAt).toBeInstanceOf(Date);
  });

  it('returns 401 when Plex token validation fails during refresh', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    plexMock.validateToken.mockResolvedValue({ valid: false });

    const res = await refreshPost();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/expired/i);
  });

  it('returns 401 when refresh is requested without a session', async () => {
    await seedConfiguredSettings();

    const res = await refreshPost();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Session expired');
    expect(plexMock.validateToken).not.toHaveBeenCalled();
  });

  it('clears the session cookie on logout', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const res = await logoutDelete();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe('Logged out successfully');
    expect(getTestCookie('decidarr_session')).toBeUndefined();
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
      const res = await meGet();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized' });
    });

    it('POST /api/auth/refresh answers 401 Session expired', async () => {
      await setForeignSessionCookie();
      const res = await refreshPost();
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Session expired' });
    });

    it('a protected route answers 401 for an expired session', async () => {
      await setForeignSessionCookie({ expiresIn: -10 });
      const res = await sectionsGet(new NextRequest('http://localhost/api/library/sections'));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    });
  });
});
