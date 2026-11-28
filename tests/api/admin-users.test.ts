import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  createModernSessionToken,
  seedConfiguredSettings,
  seedTestUser,
  TEST_ACCOUNT_TOKEN,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { issueTokenPair, rotateRefreshToken } from '@/lib/mobile-auth/tokens';
import { fakeIntegrations, fakePlexTv, type SentRequest } from '../helpers/fake-integrations';

import { GET as adminUsersGet } from '@/app/api/admin/users/route';
import { PUT as adminUserPut } from '@/app/api/admin/users/[plexUserId]/route';
import { GET as meGet } from '@/app/api/auth/me/route';

describe('Admin users API routes', () => {
  let sent: SentRequest[];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    ({ sent } = fakeIntegrations(
      fakePlexTv({
        friends: [
          { id: 'friend-1', username: 'alice', thumb: 'alice.jpg' },
          { id: 'friend-2', username: 'bob', thumb: 'bob.jpg' },
        ],
      })
    ));
  });

  it('returns 403 for non-admin users', async () => {
    const user = await seedTestUser({
      plexUserId: 'regular-user',
      plexUsername: 'regular',
      isAdmin: false,
      isApproved: true,
    });
    await authenticateTestSession({ user });

    const res = await adminUsersGet(createJsonRequest('http://localhost/api/admin/users', 'GET'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(sent).toEqual([]);
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

    const res = await adminUsersGet(createJsonRequest('http://localhost/api/admin/users', 'GET'));
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
    // Listing Friends is the one plex.tv call that needs the Admin's account token.
    expect(sent.map(({ url, headers }) => [url.pathname, headers.get('X-Plex-Token')])).toEqual([
      ['/api/v2/friends', TEST_ACCOUNT_TOKEN],
    ]);
  });

  it('lists only local users when the Admin holds no readable account token', async () => {
    const admin = await seedTestUser({ plexUserId: 'admin-user', plexUsername: 'admin', isAdmin: true });
    await User.updateOne({ _id: admin._id }, { $unset: { plexAccountToken: 1 } });
    await seedTestUser({ plexUserId: 'local-friend', plexUsername: 'dave', isAdmin: false });
    await authenticateTestSession({ user: admin });

    const res = await adminUsersGet(createJsonRequest('http://localhost/api/admin/users', 'GET'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.users.map((u: { id: string }) => u.id)).toEqual(['local-friend']);
    expect(sent).toEqual([]);
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
    const meRes = await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'));
    expect(meRes.status).toBe(401);
  });

  it('revoking a Friend also revokes all of their mobile refresh tokens', async () => {
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
    const tokens = await issueTokenPair(targetUser, 'friends-phone');
    await authenticateTestSession({ user: admin });

    const req = createJsonRequest('http://localhost/api/admin/users/friend-1', 'PUT', {
      approved: false,
    });
    const res = await adminUserPut(req as NextRequest, {
      params: Promise.resolve({ plexUserId: 'friend-1' }),
    });
    expect(res.status).toBe(200);

    const stored = await MobileRefreshToken.findOne({ userId: targetUser._id });
    expect(stored?.revokedAt).toBeInstanceOf(Date);

    await expect(rotateRefreshToken(tokens.refreshToken, 'friends-phone')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
