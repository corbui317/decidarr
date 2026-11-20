import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { IUser } from '@/lib/models/User';
import { PUT as preferencesPut, PATCH as preferencesPatch } from '@/app/api/users/me/preferences/route';

describe('Preferences API validation and spin history merging', () => {
  let testUser: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const auth = await authenticateTestSession();
    testUser = auth.user;
  });

  describe('PUT /api/users/me/preferences validation', () => {
    it('rejects malformed body (not an object)', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', null);
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('rejects malformed body (array instead of object)', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', []);
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('rejects invalid theme value', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', {
        theme: 'invalid-theme',
      });
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('theme');
    });

    it('rejects invalid savedFilters (not an object)', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', {
        savedFilters: 'invalid',
      });
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('savedFilters');
    });

    it('rejects invalid savedFilters with non-array values', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', {
        savedFilters: {
          genres: 'not-an-array',
        },
      });
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });

    it('accepts valid savedFilters', async () => {
      const req = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', {
        savedFilters: {
          genres: ['Action', 'Comedy'],
          studios: ['Warner Bros'],
        },
      });
      const res = await preferencesPut(req as never);
      expect(res.status).toBe(200);
    });
  });

  describe('Spin history merging consistency', () => {
    it('PUT and PATCH both trim spin history when reducing retention limit', async () => {
      const baseDate = new Date('2024-01-01T00:00:00Z');
      await SpinHistoryEntry.create([
        {
          userId: testUser._id,
          plexId: '1',
          title: 'Entry 1',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime()),
        },
        {
          userId: testUser._id,
          plexId: '2',
          title: 'Entry 2',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime() + 1000),
        },
        {
          userId: testUser._id,
          plexId: '3',
          title: 'Entry 3',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime() + 2000),
        },
      ]);

      const putReq = createJsonRequest('http://localhost/api/users/me/preferences', 'PUT', {
        spinHistory: { retentionLimit: 1 },
      });
      const putRes = await preferencesPut(putReq as never);
      expect(putRes.status).toBe(200);

      const countAfterPut = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
      expect(countAfterPut).toBe(1);
      const remainingAfterPut = await SpinHistoryEntry.findOne({ userId: testUser._id });
      expect(remainingAfterPut?.plexId).toBe('3');

      await SpinHistoryEntry.create([
        {
          userId: testUser._id,
          plexId: '4',
          title: 'Entry 4',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime() + 3000),
        },
        {
          userId: testUser._id,
          plexId: '5',
          title: 'Entry 5',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime() + 4000),
        },
        {
          userId: testUser._id,
          plexId: '6',
          title: 'Entry 6',
          mediaType: 'movie',
          libraryIds: [],
          spunAt: new Date(baseDate.getTime() + 5000),
        },
      ]);

      testUser.preferences.spinHistory = {
        enabled: true,
        retentionLimit: 10,
        storeFilterSnapshot: true,
      };
      await testUser.save();

      const patchReq = createJsonRequest('http://localhost/api/users/me/preferences', 'PATCH', {
        spinHistory: { retentionLimit: 1 },
      });
      const patchRes = await preferencesPatch(patchReq as never);
      expect(patchRes.status).toBe(200);

      const countAfterPatch = await SpinHistoryEntry.countDocuments({ userId: testUser._id });
      expect(countAfterPatch).toBe(1);
      const remainingAfterPatch = await SpinHistoryEntry.findOne({ userId: testUser._id });
      expect(remainingAfterPatch?.plexId).toBe('6');
    });
  });
});
