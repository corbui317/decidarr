import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  seedConfiguredSettings,
  seedTestUser,
} from '../helpers/auth';
import { postSyncMutations, syncMutation } from '../helpers/sync';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { SyncChange } from '@/lib/models/SyncChange';
import { SyncEntityRevision } from '@/lib/models/SyncEntityRevision';
import { AppliedSyncMutation } from '@/lib/models/AppliedSyncMutation';
import { POST as watchedPost, DELETE as watchedDelete } from '@/app/api/watched/[plexId]/route';

const SPIN = { plexId: 'movie-1', title: 'Movie One', mediaType: 'movie', libraryIds: ['1'] };

function plexIdContext(plexId: string) {
  return { params: Promise.resolve({ plexId }) };
}

describe('sync mutations follow the same user-data rules as REST', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    await seedConfiguredSettings();
  });

  describe('Admin-only manual watched', () => {
    it("rejects a Friend's sync mutation marking a title watched exactly like the REST call", async () => {
      const friend = await seedTestUser({ plexUserId: 'friend-1', plexUsername: 'friend', isAdmin: false });

      await authenticateTestSession({ user: friend });
      const rest = await watchedPost(
        createJsonRequest('http://localhost/api/watched/movie-1', 'POST', { mediaType: 'movie', title: 'Movie One' }),
        plexIdContext('movie-1')
      );
      expect(rest.status).toBe(403);
      const restBody = await rest.json();
      clearTestCookies();

      const res = await postSyncMutations(friend, [
        syncMutation({
          mutationId: 'friend-mark',
          entityType: 'watched',
          entityId: 'movie-1',
          payload: { mediaType: 'movie', title: 'Movie One' },
        }),
      ]);

      expect(res.status).toBe(200);
      expect((await res.json()).results).toEqual([
        { mutationId: 'friend-mark', status: 'rejected', code: restBody.code, error: restBody.error },
      ]);
      expect(await WatchedItem.countDocuments({ userId: friend._id })).toBe(0);
      expect(await SyncChange.countDocuments({ userId: friend._id })).toBe(0);
    });

    it("rejects a Friend's sync mutation unmarking a title exactly like the REST call", async () => {
      const friend = await seedTestUser({ plexUserId: 'friend-1', plexUsername: 'friend', isAdmin: false });
      await WatchedItem.create({ userId: friend._id, plexId: 'movie-1', mediaType: 'movie', title: 'Movie One', source: 'tautulli' });

      await authenticateTestSession({ user: friend });
      const rest = await watchedDelete(
        createJsonRequest('http://localhost/api/watched/movie-1', 'DELETE'),
        plexIdContext('movie-1')
      );
      expect(rest.status).toBe(403);
      const restBody = await rest.json();
      clearTestCookies();

      const res = await postSyncMutations(friend, [
        syncMutation({ mutationId: 'friend-unmark', entityType: 'watched', operation: 'delete', entityId: 'movie-1' }),
      ]);

      expect((await res.json()).results).toEqual([
        { mutationId: 'friend-unmark', status: 'rejected', code: restBody.code, error: restBody.error },
      ]);
      expect(await WatchedItem.countDocuments({ userId: friend._id })).toBe(1);
    });
  });

  describe('malformed mutations', () => {
    it('rejects an object entityId before it reaches MongoDB', async () => {
      const admin = await seedTestUser();
      await WatchedItem.create({ userId: admin._id, plexId: 'movie-1', mediaType: 'movie', title: 'Kept' });

      const res = await postSyncMutations(admin, [
        syncMutation({ entityType: 'watched', operation: 'delete', entityId: { $ne: null } }),
      ]);

      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
      expect(await WatchedItem.countDocuments({ userId: admin._id })).toBe(1);
      expect(await SyncChange.countDocuments()).toBe(0);
      expect(await AppliedSyncMutation.countDocuments()).toBe(0);
    });

    it('rejects a batch whose mutation is missing its envelope fields', async () => {
      const admin = await seedTestUser();

      const res = await postSyncMutations(admin, [{ entityType: 'watched', payload: {} }]);

      expect(res.status).toBe(400);
      expect(await AppliedSyncMutation.countDocuments()).toBe(0);
    });

    it('rejects a payload the REST contract refuses, and writes nothing', async () => {
      const admin = await seedTestUser();

      const res = await postSyncMutations(admin, [
        syncMutation({
          mutationId: 'bad-watched',
          entityType: 'watched',
          entityId: 'movie-1',
          payload: { mediaType: 'song', title: { $gt: '' } },
        }),
        syncMutation({ mutationId: 'bad-spin', entityType: 'spin_history', entityId: 'local-1', payload: { title: '' } }),
      ]);

      const { results } = await res.json();
      expect(results.map((r: { status: string; code?: string }) => [r.status, r.code])).toEqual([
        ['rejected', 'VALIDATION_FAILED'],
        ['rejected', 'VALIDATION_FAILED'],
      ]);
      expect(await WatchedItem.countDocuments()).toBe(0);
      expect(await SpinHistoryEntry.countDocuments()).toBe(0);
      expect(await SyncChange.countDocuments()).toBe(0);
    });
  });

  describe('mutation bookkeeping', () => {
    it('answers a replayed mutation id as a duplicate without writing again', async () => {
      const admin = await seedTestUser();
      const mark = syncMutation({
        mutationId: 'mark-once',
        entityType: 'watched',
        entityId: 'movie-1',
        payload: { mediaType: 'movie', title: 'Movie One' },
      });

      await postSyncMutations(admin, [mark]);
      const res = await postSyncMutations(admin, [mark]);

      expect((await res.json()).results).toEqual([{ mutationId: 'mark-once', status: 'duplicate', revision: 1 }]);
      expect(await SyncChange.countDocuments({ userId: admin._id })).toBe(1);
    });

    it('answers a stale base revision as a conflict, and a deleted entity as deleted', async () => {
      const admin = await seedTestUser();
      const payload = { mediaType: 'movie', title: 'Movie One' };
      await postSyncMutations(admin, [
        syncMutation({ entityType: 'watched', entityId: 'movie-1', payload }),
        syncMutation({ entityType: 'watched', entityId: 'movie-1', payload, baseRevision: 1 }),
        syncMutation({ entityType: 'watched', entityId: 'movie-2', payload }),
        syncMutation({ entityType: 'watched', operation: 'delete', entityId: 'movie-2', baseRevision: 1 }),
      ]);

      const res = await postSyncMutations(admin, [
        syncMutation({ mutationId: 'stale', entityType: 'watched', entityId: 'movie-1', payload, baseRevision: 1 }),
        syncMutation({ mutationId: 'gone', entityType: 'watched', entityId: 'movie-2', payload, baseRevision: 1 }),
      ]);

      expect((await res.json()).results).toEqual([
        { mutationId: 'stale', status: 'conflict', reason: 'revision_mismatch', serverRevision: 2, serverValue: null },
        { mutationId: 'gone', status: 'conflict', reason: 'deleted', serverRevision: 2, serverValue: null },
      ]);
      expect(await WatchedItem.countDocuments({ userId: admin._id })).toBe(1);
    });

    it("rejects a preference mutation naming another user, and an operation REST does not offer", async () => {
      const admin = await seedTestUser();

      const res = await postSyncMutations(admin, [
        syncMutation({ mutationId: 'other-user', entityId: '65a000000000000000000099', payload: { theme: 'light' } }),
        syncMutation({ mutationId: 'delete-prefs', operation: 'delete', entityId: admin._id.toString() }),
      ]);

      const { results } = await res.json();
      expect(results.map((r: { mutationId: string; status: string; code?: string }) => [r.mutationId, r.status, r.code])).toEqual([
        ['other-user', 'rejected', 'VALIDATION_FAILED'],
        ['delete-prefs', 'rejected', 'VALIDATION_FAILED'],
      ]);
      expect(await SyncChange.countDocuments()).toBe(0);
    });
  });

  describe('spin history created through sync', () => {
    it('trims to the retention limit and tells clients about the trimmed entry', async () => {
      const user = await seedTestUser({ spinHistory: { retentionLimit: 2 } });
      const oldest = await SpinHistoryEntry.create({ userId: user._id, ...SPIN, title: 'Oldest', spunAt: new Date('2026-01-01') });
      await SpinHistoryEntry.create({ userId: user._id, ...SPIN, title: 'Older', spunAt: new Date('2026-01-02') });

      const res = await postSyncMutations(user, [
        syncMutation({ entityType: 'spin_history', entityId: 'local-1', payload: SPIN }),
      ]);

      expect((await res.json()).results[0].status).toBe('applied');
      const titles = (await SpinHistoryEntry.find({ userId: user._id }).sort({ spunAt: 1 }).lean()).map((e) => e.title);
      expect(titles).toEqual(['Older', 'Movie One']);
      expect(
        await SyncChange.countDocuments({ userId: user._id, entityId: oldest._id.toString(), operation: 'delete' })
      ).toBe(1);
    });

    it('returns the revision of the server-assigned entry, with its id', async () => {
      const user = await seedTestUser();
      // The client reuses, as its local id, the id of an entry it created and then deleted (revision 2).
      await postSyncMutations(user, [
        syncMutation({ mutationId: 'create-1', entityType: 'spin_history', entityId: 'local-1', payload: SPIN }),
      ]);
      const firstId = (await SpinHistoryEntry.findOne({ userId: user._id }).lean())!._id.toString();
      await postSyncMutations(user, [
        syncMutation({ mutationId: 'delete-1', entityType: 'spin_history', operation: 'delete', entityId: firstId }),
      ]);

      const res = await postSyncMutations(user, [
        syncMutation({ mutationId: 'create-2', entityType: 'spin_history', entityId: firstId, payload: SPIN }),
      ]);

      const created = (await SpinHistoryEntry.findOne({ userId: user._id }).lean())!;
      const revision = await SyncEntityRevision.findOne({ userId: user._id, entityId: created._id.toString() }).lean();
      expect((await res.json()).results).toEqual([
        { mutationId: 'create-2', status: 'applied', revision: 1, entityId: created._id.toString() },
      ]);
      expect(revision?.revision).toBe(1);
    });
  });
});
