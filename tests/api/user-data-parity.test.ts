/**
 * REST-versus-sync parity: every user-data operation, sent once through its REST route
 * (web, cookie) and once as a sync mutation (mobile, bearer) against the same seed,
 * must leave the same persisted state, the same sync changes, and the same rejection.
 */
import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
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
import { User, type IUser } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { SyncChange } from '@/lib/models/SyncChange';
import { PUT as preferencesPut, PATCH as preferencesPatch } from '@/app/api/users/me/preferences/route';
import { POST as watchedPost, DELETE as watchedDelete } from '@/app/api/watched/[plexId]/route';
import { POST as spinHistoryPost } from '@/app/api/spin-history/route';
import { DELETE as spinHistoryDelete } from '@/app/api/spin-history/[id]/route';

type Actor = 'admin' | 'friend';

interface Operation {
  name: string;
  /** Data that exists before the operation, written straight to the database. */
  seed?: (user: IUser) => Promise<unknown>;
  /** User fields the seeded user starts with. */
  spinHistory?: { enabled?: boolean; retentionLimit?: number };
  rest: (user: IUser) => Promise<Response>;
  /** The same operation as a sync mutation; `userId` is the acting user's id. */
  sync: (userId: string) => Record<string, unknown>;
}

const SEEDED_SPIN_ID = new mongoose.Types.ObjectId('65a000000000000000000001');
const MISSING_SPIN_ID = '65a0000000000000000000ff';

const SPIN = {
  plexId: 'movie-1',
  title: 'Movie One',
  mediaType: 'movie',
  thumbPath: '/library/metadata/1/thumb?X-Plex-Token=leaked',
  year: 2020,
  libraryIds: ['1'],
  filtersSnapshot: { genres: ['Drama'], plexToken: 'leaked', apiKey: 'leaked' },
  tvSelectionMode: 'show',
  poolSizeAtSpin: 12,
};

const url = (path: string) => `http://localhost/api${path}`;
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

async function seedSpins(user: IUser, count: number) {
  for (let i = 0; i < count; i += 1) {
    await SpinHistoryEntry.create({
      ...(i === 0 ? { _id: SEEDED_SPIN_ID } : {}),
      userId: user._id,
      plexId: `old-${i}`,
      title: `Old ${i}`,
      mediaType: 'movie',
      spunAt: new Date(Date.UTC(2026, 0, i + 1)),
    });
  }
}

const seedWatched = (user: IUser) =>
  WatchedItem.create({ userId: user._id, plexId: 'movie-1', mediaType: 'movie', title: 'Movie One', source: 'tautulli' });

const putPreferences = (body: unknown) => () => preferencesPut(createJsonRequest(url('/users/me/preferences'), 'PUT', body));
const preferenceMutation = (payload: unknown) => (userId: string) =>
  syncMutation({ entityType: 'preference', entityId: userId, payload });

const OPERATIONS: Operation[] = [
  {
    name: 'update appearance, libraries, and saved filters',
    seed: async (user) =>
      User.updateOne({ _id: user._id }, { $set: { 'preferences.savedFilters.studios': ['A24'] } }),
    rest: putPreferences({
      theme: 'light',
      animationStyle: 'wheel',
      selectedLibraries: ['1', '2'],
      savedFilters: { genres: ['Drama'], yearRange: { start: 1990 }, unwatchedOnly: true },
    }),
    sync: preferenceMutation({
      theme: 'light',
      animationStyle: 'wheel',
      selectedLibraries: ['1', '2'],
      savedFilters: { genres: ['Drama'], yearRange: { start: 1990 }, unwatchedOnly: true },
    }),
  },
  {
    name: 'lower the spin history retention limit, trimming the oldest entries',
    seed: (user) => seedSpins(user, 3),
    rest: putPreferences({ spinHistory: { retentionLimit: 1 } }),
    sync: preferenceMutation({ spinHistory: { retentionLimit: 1 } }),
  },
  {
    name: 'patch spin history preferences, clamping an out-of-range limit',
    seed: (user) => seedSpins(user, 2),
    rest: () =>
      preferencesPatch(
        createJsonRequest(url('/users/me/preferences'), 'PATCH', {
          spinHistory: { enabled: false, retentionLimit: 9999 },
        })
      ),
    sync: preferenceMutation({ spinHistory: { enabled: false, retentionLimit: 9999 } }),
  },
  {
    name: 'refuse an unknown theme',
    rest: putPreferences({ theme: 'neon' }),
    sync: preferenceMutation({ theme: 'neon' }),
  },
  {
    name: 'refuse an empty preferences update',
    rest: putPreferences({}),
    sync: preferenceMutation({}),
  },
  {
    name: 'mark a title watched manually',
    rest: () =>
      watchedPost(
        createJsonRequest(url('/watched/movie-1'), 'POST', { mediaType: 'movie', title: 'Movie One' }),
        params({ plexId: 'movie-1' })
      ),
    sync: () =>
      syncMutation({ entityType: 'watched', entityId: 'movie-1', payload: { mediaType: 'movie', title: 'Movie One' } }),
  },
  {
    name: 'refuse a watched mark with an unknown media type',
    rest: () =>
      watchedPost(
        createJsonRequest(url('/watched/movie-1'), 'POST', { mediaType: 'song', title: 'Movie One' }),
        params({ plexId: 'movie-1' })
      ),
    sync: () =>
      syncMutation({ entityType: 'watched', entityId: 'movie-1', payload: { mediaType: 'song', title: 'Movie One' } }),
  },
  {
    name: 'mark a title unwatched',
    seed: seedWatched,
    rest: () => watchedDelete(createJsonRequest(url('/watched/movie-1'), 'DELETE'), params({ plexId: 'movie-1' })),
    sync: () => syncMutation({ entityType: 'watched', operation: 'delete', entityId: 'movie-1' }),
  },
  {
    name: 'record a spin, sanitizing its thumb path and filter snapshot',
    rest: () => spinHistoryPost(createJsonRequest(url('/spin-history'), 'POST', SPIN)),
    sync: () => syncMutation({ entityType: 'spin_history', entityId: 'local-1', payload: SPIN }),
  },
  {
    name: 'record a spin past the retention limit, trimming the oldest entry',
    spinHistory: { retentionLimit: 2 },
    seed: (user) => seedSpins(user, 2),
    rest: () => spinHistoryPost(createJsonRequest(url('/spin-history'), 'POST', SPIN)),
    sync: () => syncMutation({ entityType: 'spin_history', entityId: 'local-1', payload: SPIN }),
  },
  {
    name: 'skip a spin while spin history is turned off',
    spinHistory: { enabled: false },
    rest: () => spinHistoryPost(createJsonRequest(url('/spin-history'), 'POST', SPIN)),
    sync: () => syncMutation({ entityType: 'spin_history', entityId: 'local-1', payload: SPIN }),
  },
  {
    name: 'refuse a spin with no title',
    rest: () => spinHistoryPost(createJsonRequest(url('/spin-history'), 'POST', { ...SPIN, title: '' })),
    sync: () => syncMutation({ entityType: 'spin_history', entityId: 'local-1', payload: { ...SPIN, title: '' } }),
  },
  {
    name: 'delete a spin history entry',
    seed: (user) => seedSpins(user, 2),
    rest: () =>
      spinHistoryDelete(
        createJsonRequest(url(`/spin-history/${SEEDED_SPIN_ID}`), 'DELETE'),
        params({ id: SEEDED_SPIN_ID.toString() })
      ),
    sync: () => syncMutation({ entityType: 'spin_history', operation: 'delete', entityId: SEEDED_SPIN_ID.toString() }),
  },
  {
    name: 'refuse to delete a spin history entry that does not exist',
    rest: () =>
      spinHistoryDelete(
        createJsonRequest(url(`/spin-history/${MISSING_SPIN_ID}`), 'DELETE'),
        params({ id: MISSING_SPIN_ID })
      ),
    sync: () => syncMutation({ entityType: 'spin_history', operation: 'delete', entityId: MISSING_SPIN_ID }),
  },
  {
    name: 'refuse to delete a spin history entry by a malformed id',
    rest: () =>
      spinHistoryDelete(createJsonRequest(url('/spin-history/not-an-id'), 'DELETE'), params({ id: 'not-an-id' })),
    sync: () => syncMutation({ entityType: 'spin_history', operation: 'delete', entityId: 'not-an-id' }),
  },
];

type Outcome = 'ok' | { rejected: string };

/**
 * What one run left behind. Ids and timestamps differ between runs, so ids are replaced
 * by their order of first appearance and server-set times are dropped.
 */
async function observe(user: IUser, outcome: Outcome) {
  const aliases = new Map<string, string>();
  const alias = (id: unknown) => {
    const key = String(id);
    if (!aliases.has(key)) aliases.set(key, `id-${aliases.size}`);
    return aliases.get(key)!;
  };
  alias(user._id);
  const withoutTimes = (record: Record<string, unknown>) => {
    const copy = { ...record };
    for (const field of ['_id', '__v', 'userId', 'createdAt', 'updatedAt', 'watchedAt', 'spunAt']) delete copy[field];
    if ('id' in copy) copy.id = alias(copy.id);
    return copy;
  };

  const userId = user._id;
  const [stored, watched, spins, changes] = await Promise.all([
    User.findById(userId).lean(),
    WatchedItem.find({ userId }).sort({ plexId: 1 }).lean(),
    SpinHistoryEntry.find({ userId }).sort({ spunAt: 1 }).lean(),
    SyncChange.find({ userId }).sort({ _id: 1 }).lean(),
  ]);

  return {
    outcome,
    preferences: stored!.preferences,
    watched: watched.map((item) => withoutTimes(item as unknown as Record<string, unknown>)),
    spinHistory: spins.map((entry) => ({ id: alias(entry._id), ...withoutTimes(entry as unknown as Record<string, unknown>) })),
    changes: changes.map((change) => ({
      entityType: change.entityType,
      entityId: change.entityType === 'watched' ? change.entityId : alias(change.entityId),
      operation: change.operation,
      revision: change.revision,
      data: change.data ? withoutTimes(change.data as Record<string, unknown>) : null,
    })),
  };
}

async function run(path: 'rest' | 'sync', operation: Operation, actor: Actor) {
  await clearDatabase();
  clearTestCookies();
  clearRateLimitStore();
  await seedConfiguredSettings();
  const user = await seedTestUser({
    plexUserId: actor,
    plexUsername: actor,
    isAdmin: actor === 'admin',
    spinHistory: operation.spinHistory,
  });
  await operation.seed?.(user);

  let outcome: Outcome;
  if (path === 'rest') {
    await authenticateTestSession({ user });
    const res = await operation.rest(user);
    outcome = res.ok ? 'ok' : { rejected: (await res.json()).code };
    clearTestCookies();
  } else {
    const res = await postSyncMutations(user, [operation.sync(user._id.toString())]);
    expect(res.status).toBe(200);
    const [result] = (await res.json()).results;
    expect(['applied', 'rejected']).toContain(result.status);
    outcome = result.status === 'applied' ? 'ok' : { rejected: result.code };
  }
  return observe(user, outcome);
}

describe('user-data parity: REST and sync mutations', () => {
  for (const actor of ['admin', 'friend'] as const) {
    describe(`as ${actor === 'admin' ? 'the Admin' : 'a Friend'}`, () => {
      for (const operation of OPERATIONS) {
        it(operation.name, async () => {
          const viaRest = await run('rest', operation, actor);
          const viaSync = await run('sync', operation, actor);
          expect(viaSync).toEqual(viaRest);
        });
      }
    });
  }

  it('really exercises both outcomes, so parity is not trivially empty', async () => {
    const admin = await run('rest', OPERATIONS[OPERATIONS.findIndex((o) => o.name === 'mark a title watched manually')], 'admin');
    const friend = await run('sync', OPERATIONS[OPERATIONS.findIndex((o) => o.name === 'mark a title watched manually')], 'friend');
    expect(admin.outcome).toBe('ok');
    expect(admin.watched).toHaveLength(1);
    expect(admin.changes).toHaveLength(1);
    expect(friend.outcome).toEqual({ rejected: 'FORBIDDEN' });
    expect(friend.watched).toHaveLength(0);
  });
});
