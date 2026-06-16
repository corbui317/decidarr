import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  seedTestUser,
  createModernSessionToken,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { IUser } from '@/lib/models/User';
import {
  GET as spinHistoryGet,
  POST as spinHistoryPost,
  DELETE as spinHistoryDelete,
} from '@/app/api/spin-history/route';
import { DELETE as spinHistoryItemDelete } from '@/app/api/spin-history/[id]/route';
import { PATCH as preferencesPatch } from '@/app/api/users/me/preferences/route';

describe('Spin history API routes', () => {
  let testUser: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const auth = await authenticateTestSession();
    testUser = auth.user;
  });

  it('returns 401 without session', async () => {
    clearTestCookies();
    const req = new NextRequest('http://localhost/api/spin-history');
    const res = await spinHistoryGet(req);
    expect(res.status).toBe(401);
  });

  it('creates and lists spin history entries for the authenticated user', async () => {
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
    expect(body.items[0].userId).toBe(testUser._id.toString());
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

  it('skips recording when disabled via installation settings for single-user scope', async () => {
    const settings = await seedConfiguredSettings();
    settings.spinHistoryPreferences = {
      enabled: false,
      retentionLimit: 50,
      storeFilterSnapshot: true,
    };
    await settings.save();

    clearTestCookies();
    const { getSpinHistoryPreferences } = await import('@/lib/spin-history');
    const prefs = await getSpinHistoryPreferences();
    expect(prefs.enabled).toBe(false);
  });

  it('omits filter snapshot when storeFilterSnapshot is false', async () => {
    testUser.preferences = testUser.preferences || {};
    testUser.preferences.spinHistory = {
      enabled: true,
      retentionLimit: 50,
      storeFilterSnapshot: false,
    };
    await testUser.save();

    const postReq = createJsonRequest('http://localhost/api/spin-history', 'POST', {
      plexId: '99',
      title: 'Test Spin',
      mediaType: 'movie',
      filtersSnapshot: { genres: ['Action'] },
    });
    const postRes = await spinHistoryPost(postReq as never);
    expect(postRes.status).toBe(201);
    const { entry } = await postRes.json();
    expect(entry.filtersSnapshot).toBeUndefined();
  });

  it('deletes one entry scoped to the owner', async () => {
    const entry = await SpinHistoryEntry.create({
      userId: testUser._id,
      plexId: '1',
      title: 'Owned Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const otherUser = await seedTestUser({
      plexUserId: 'plex-user-other',
      plexUsername: 'otheruser',
    });
    await SpinHistoryEntry.create({
      userId: otherUser._id,
      plexId: '2',
      title: 'Other Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const deleteReq = createJsonRequest(
      `http://localhost/api/spin-history/${entry._id}`,
      'DELETE'
    );
    const deleteRes = await spinHistoryItemDelete(deleteReq as never, {
      params: Promise.resolve({ id: entry._id.toString() }),
    });
    expect(deleteRes.status).toBe(200);

    const remaining = await SpinHistoryEntry.find({ userId: testUser._id });
    expect(remaining).toHaveLength(0);

    const otherRemaining = await SpinHistoryEntry.countDocuments({ userId: otherUser._id });
    expect(otherRemaining).toBe(1);
  });

  it('returns 404 when deleting another users entry', async () => {
    const otherUser = await seedTestUser({
      plexUserId: 'plex-user-other-2',
      plexUsername: 'otheruser2',
    });
    const entry = await SpinHistoryEntry.create({
      userId: otherUser._id,
      plexId: '3',
      title: 'Other Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const deleteReq = createJsonRequest(
      `http://localhost/api/spin-history/${entry._id}`,
      'DELETE'
    );
    const deleteRes = await spinHistoryItemDelete(deleteReq as never, {
      params: Promise.resolve({ id: entry._id.toString() }),
    });
    expect(deleteRes.status).toBe(404);
  });

  it('clears all history for the authenticated user only', async () => {
    await SpinHistoryEntry.create({
      userId: testUser._id,
      plexId: '1',
      title: 'Old Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const otherUser = await seedTestUser({
      plexUserId: 'plex-user-other-3',
      plexUsername: 'otheruser3',
    });
    await SpinHistoryEntry.create({
      userId: otherUser._id,
      plexId: '2',
      title: 'Other Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const res = await spinHistoryDelete();
    const body = await res.json();
    expect(body.deleted).toBe(1);

    const ownCount = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
    expect(ownCount).toBe(0);

    const otherCount = await SpinHistoryEntry.countDocuments({ userId: otherUser._id });
    expect(otherCount).toBe(1);
  });

  it('trims oldest entries on create beyond retention limit', async () => {
    testUser.preferences = testUser.preferences || {};
    testUser.preferences.spinHistory = {
      enabled: true,
      retentionLimit: 2,
      storeFilterSnapshot: true,
    };
    await testUser.save();

    for (let i = 0; i < 3; i++) {
      const postReq = createJsonRequest('http://localhost/api/spin-history', 'POST', {
        plexId: `plex-${i}`,
        title: `Spin ${i}`,
        mediaType: 'movie',
      });
      await spinHistoryPost(postReq as never);
    }

    const count = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
    expect(count).toBe(2);

    const items = await SpinHistoryEntry.find({ userId: testUser._id }).sort({ spunAt: -1 });
    expect(items[0].plexId).toBe('plex-2');
    expect(items[1].plexId).toBe('plex-1');
  });

  it('trims history when PATCH lowers retention limit', async () => {
    const baseDate = new Date('2024-01-01T00:00:00Z');
    await SpinHistoryEntry.create([
      {
        userId: testUser._id,
        plexId: '1',
        title: 'Oldest',
        mediaType: 'movie',
        libraryIds: [],
        spunAt: new Date(baseDate.getTime()),
      },
      {
        userId: testUser._id,
        plexId: '2',
        title: 'Middle',
        mediaType: 'movie',
        libraryIds: [],
        spunAt: new Date(baseDate.getTime() + 1000),
      },
      {
        userId: testUser._id,
        plexId: '3',
        title: 'Newest',
        mediaType: 'movie',
        libraryIds: [],
        spunAt: new Date(baseDate.getTime() + 2000),
      },
    ]);

    const patchReq = createJsonRequest('http://localhost/api/users/me/preferences', 'PATCH', {
      spinHistory: { retentionLimit: 1 },
    });
    const patchRes = await preferencesPatch(patchReq as never);
    expect(patchRes.status).toBe(200);

    const count = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
    expect(count).toBe(1);

    const remaining = await SpinHistoryEntry.findOne({ userId: testUser._id });
    expect(remaining?.plexId).toBe('3');
  });

  it('isolates history between authenticated users', async () => {
    const otherUser = await seedTestUser({
      plexUserId: 'plex-user-isolated',
      plexUsername: 'isolated',
    });
    await SpinHistoryEntry.create({
      userId: otherUser._id,
      plexId: 'other',
      title: 'Other User Spin',
      mediaType: 'movie',
      libraryIds: [],
      spunAt: new Date(),
    });

    const token = await createModernSessionToken(otherUser);
    setTestCookie('decidarr_session', token);

    const getReq = new NextRequest('http://localhost/api/spin-history');
    const getRes = await spinHistoryGet(getReq);
    const body = await getRes.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].plexId).toBe('other');
  });
});
