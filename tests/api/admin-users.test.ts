import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  createModernSessionToken,
  seedConfiguredSettings,
  seedTestUser,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';

const plexOAuthMocks = vi.hoisted(() => ({
  fetchPlexFriends: vi.fn(),
}));

vi.mock('@/lib/services/plex-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/plex-oauth')>();
  return {
    ...actual,
    fetchPlexFriends: plexOAuthMocks.fetchPlexFriends,
  };
});

import { GET as adminUsersGet } from '@/app/api/admin/users/route';
import { PUT as adminUserPut } from '@/app/api/admin/users/[plexUserId]/route';
import { GET as meGet } from '@/app/api/auth/me/route';

describe('Admin users API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    vi.clearAllMocks();
    plexOAuthMocks.fetchPlexFriends.mockResolvedValue([
      { id: 'friend-1', username: 'alice', thumb: 'alice.jpg' },
      { id: 'friend-2', username: 'bob', thumb: 'bob.jpg' },
    ]);
  });

  it('returns 403 for non-admin users', async () => {
    const user = await seedTestUser({
      plexUserId: 'regular-user',
      plexUsername: 'regular',
      isAdmin: false,
      isApproved: true,
    });
    await authenticateTestSession({ user });

    const res = await adminUsersGet();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(plexOAuthMocks.fetchPlexFriends).not.toHaveBeenCalled();
  });

  it('lets admins list pending Plex friends and local users', async () => {
    const admin = await seedTestUser({
      plexUserId: 'admin-user',
      plexUsername: 'admin',
      isAdmin: true,
      isApproved: true,
    });
    const localPending = await seedTestUser({
      plexUserId: 'local-pending',
      plexUsername: 'carol',
      isAdmin: false,
      isApproved: false,
    });
    const settings = await getOrCreateSettings();
    settings.approvedPlexUserIds = ['friend-2'];
    await settings.save();
    await authenticateTestSession({ user: admin });

    const res = await adminUsersGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'friend-1', username: 'alice', isApproved: false }),
        expect.objectContaining({ id: 'friend-2', username: 'bob', isApproved: true }),
        expect.objectContaining({
          id: localPending.plexUserId,
          username: 'carol',
          isApproved: false,
        }),
      ])
    );
  });

  it('approves users by adding them to configured visibility and user state', async () => {
    const admin = await seedTestUser({
      plexUserId: 'admin-user',
      plexUsername: 'admin',
      isAdmin: true,
      isApproved: true,
    });
    await seedTestUser({
      plexUserId: 'friend-1',
      plexUsername: 'alice',
      isAdmin: false,
      isApproved: false,
    });
    await authenticateTestSession({ user: admin });

    const req = createJsonRequest('http://localhost/api/admin/users/friend-1', 'PUT', {
      approved: true,
    });
    const res = await adminUserPut(req as NextRequest, {
      params: Promise.resolve({ plexUserId: 'friend-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, plexUserId: 'friend-1', approved: true });

    const settings = await getOrCreateSettings();
    const approvedUser = await User.findOne({ plexUserId: 'friend-1' });
    expect(settings.approvedPlexUserIds).toContain('friend-1');
    expect(approvedUser?.isApproved).toBe(true);
  });

  it('revoking a user increments session version so existing sessions are blocked', async () => {
    const admin = await seedTestUser({
      plexUserId: 'admin-user',
      plexUsername: 'admin',
      isAdmin: true,
      isApproved: true,
    });
    const targetUser = await seedTestUser({
      plexUserId: 'friend-1',
      plexUsername: 'alice',
      isAdmin: false,
      isApproved: true,
    });
    const staleSession = await createModernSessionToken(targetUser);
    await authenticateTestSession({ user: admin });

    const req = createJsonRequest('http://localhost/api/admin/users/friend-1', 'PUT', {
      approved: false,
    });
    const res = await adminUserPut(req as NextRequest, {
      params: Promise.resolve({ plexUserId: 'friend-1' }),
    });
    expect(res.status).toBe(200);

    const revokedUser = await User.findOne({ plexUserId: 'friend-1' });
    expect(revokedUser?.isApproved).toBe(false);
    expect(revokedUser?.sessionVersion).toBe(1);

    setTestCookie('decidarr_session', staleSession);
    const meRes = await meGet();
    expect(meRes.status).toBe(401);
  });
});
