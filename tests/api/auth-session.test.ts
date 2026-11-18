import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  authenticateTestSession,
  clearTestCookies,
  seedConfiguredSettings,
} from '../helpers/auth';
import { getTestCookie } from '../helpers/cookies';
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
});
