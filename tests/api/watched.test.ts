import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  seedTestUser,
  createModernSessionToken,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { IUser } from '@/lib/models/User';

import { NextRequest } from 'next/server';
import { GET as watchedGet } from '@/app/api/watched/route';
import { POST as watchedPost, DELETE as watchedDelete } from '@/app/api/watched/[plexId]/route';
import {
  GET as spinHistoryGet,
  POST as spinHistoryPost,
  DELETE as spinHistoryDelete,
} from '@/app/api/spin-history/route';

describe('Watched and spin-history API routes', () => {
  let testUser: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const auth = await authenticateTestSession();
    testUser = auth.user;
  });

  describe('GET /api/watched', () => {
    it('returns 401 without session', async () => {
      clearTestCookies();
      const req = createJsonRequest('http://localhost/api/watched', 'GET');
      const res = await watchedGet(req as never);
      expect(res.status).toBe(401);
    });

    it('paginates watched items', async () => {
      const userId = testUser._id;
      await WatchedItem.create([
        {
          userId,
          plexId: '1',
          title: 'Movie A',
          mediaType: 'movie',
          watchedAt: new Date(),
          source: 'manual',
        },
        {
          userId,
          plexId: '2',
          title: 'Movie B',
          mediaType: 'movie',
          watchedAt: new Date(),
          source: 'manual',
        },
      ]);

      const req = new NextRequest('http://localhost/api/watched?page=1&limit=1');
      const res = await watchedGet(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.pagination.total).toBe(2);
    });
  });

  describe('POST/DELETE /api/watched/[plexId]', () => {
    it('allows approved non-admin user to mark and unmark watched', async () => {
      const nonAdmin = await seedTestUser({
        plexUserId: 'plex-friend-1',
        plexUsername: 'friend',
        isAdmin: false,
        isApproved: true,
      });
      const token = await createModernSessionToken(nonAdmin);
      setTestCookie('decidarr_session', token);

      const postReq = createJsonRequest('http://localhost/api/watched/plex-99', 'POST', {
        mediaType: 'movie',
        title: 'Friend Movie',
      });
      const postRes = await watchedPost(postReq as never, {
        params: Promise.resolve({ plexId: 'plex-99' }),
      });
      expect(postRes.status).toBe(200);

      const count = await WatchedItem.countDocuments({
        userId: nonAdmin._id,
        plexId: 'plex-99',
      });
      expect(count).toBe(1);

      const deleteReq = createJsonRequest('http://localhost/api/watched/plex-99', 'DELETE');
      const deleteRes = await watchedDelete(deleteReq as never, {
        params: Promise.resolve({ plexId: 'plex-99' }),
      });
      expect(deleteRes.status).toBe(200);

      const afterCount = await WatchedItem.countDocuments({
        userId: nonAdmin._id,
        plexId: 'plex-99',
      });
      expect(afterCount).toBe(0);
    });
  });

  describe('Spin history routes', () => {
    it('creates and lists spin history entries', async () => {
      const postReq = createJsonRequest('http://localhost/api/spin-history', 'POST', {
        plexId: '99',
        title: 'Test Spin',
        mediaType: 'movie',
        libraryIds: ['lib-1'],
        filtersSnapshot: { genres: ['Action'], plexToken: 'secret' },
      });
      const postRes = await spinHistoryPost(postReq as never);
      expect(postRes.status).toBe(201);

      const getReq = new NextRequest('http://localhost/api/spin-history');
      const getRes = await spinHistoryGet(getReq);
      const body = await getRes.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].filtersSnapshot?.plexToken).toBeUndefined();
    });

    it('skips recording when disabled via user preferences', async () => {
      testUser.preferences = testUser.preferences || {};
      testUser.preferences.spinHistory = {
        enabled: false,
        retentionLimit: 50,
        storeFilterSnapshot: true,
      };
      await testUser.save();

      const postReq = createJsonRequest('http://localhost/api/spin-history', 'POST', {
        plexId: '99',
        title: 'Test Spin',
        mediaType: 'movie',
      });
      const postRes = await spinHistoryPost(postReq as never);
      const body = await postRes.json();
      expect(body.skipped).toBe(true);
    });

    it('clears user spin history', async () => {
      await SpinHistoryEntry.create({
        userId: testUser._id,
        plexId: '1',
        title: 'Old Spin',
        mediaType: 'movie',
        libraryIds: [],
        spunAt: new Date(),
      });

      const res = await spinHistoryDelete();
      const body = await res.json();
      expect(body.deleted).toBe(1);

      const count = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);
    });
  });
});
