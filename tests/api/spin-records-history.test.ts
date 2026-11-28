import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { IUser } from '@/lib/models/User';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  seedTestUser,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import {
  fakeIntegrations,
  plexLibraryItems,
  plexMetadata,
  plexSections,
  routes,
  TEST_PLEX_SERVER,
} from '../helpers/fake-integrations';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import { SyncChange } from '@/lib/models/SyncChange';

import { POST as randomPost } from '@/app/api/selection/random/route';
import { GET as spinHistoryGet } from '@/app/api/spin-history/route';

/** A spin is recorded in the spinner's history by the server, once, with no call from the client. */

function fakePlexServer() {
  return fakeIntegrations(
    routes({
      [`${TEST_PLEX_SERVER}/library/sections`]: () => plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
      [`${TEST_PLEX_SERVER}/library/sections/lib-1/all`]: () => plexLibraryItems(SAMPLE_LIBRARY_ITEMS),
      ...Object.fromEntries(
        SAMPLE_LIBRARY_ITEMS.map(({ plexId, title, year }) => [
          `${TEST_PLEX_SERVER}/library/metadata/${plexId}`,
          () => plexMetadata([{ ratingKey: plexId, title, year, type: 'movie' }]),
        ])
      ),
    })
  );
}

const DRAMA = { libraryIds: ['lib-1'], mediaType: 'movie', filters: { genres: ['Drama'] } };

function withBearer(req: Request, bearer?: string): Request {
  if (bearer) req.headers.set('Authorization', `Bearer ${bearer}`);
  return req;
}

async function spin(body: unknown, bearer?: string) {
  const res = await randomPost(
    withBearer(createJsonRequest('http://localhost/api/selection/random', 'POST', body), bearer) as never
  );
  return { status: res.status, body: await res.json() };
}

async function history(bearer?: string) {
  const res = await spinHistoryGet(
    withBearer(new NextRequest('http://localhost/api/spin-history?page=1&limit=20'), bearer) as never
  );
  expect(res.status).toBe(200);
  return (await res.json()).items as Array<Record<string, unknown>>;
}

describe('Spin records history on the server', () => {
  let user: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    ({ user } = await authenticateTestSession());
    fakePlexServer();
  });

  it('records a web spin once, with what was picked and from which pool', async () => {
    const { status, body } = await spin(DRAMA);
    expect(status).toBe(200);

    const entries = await history();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: user._id.toString(),
      plexId: body.selection.plexId,
      title: body.selection.title,
      mediaType: 'movie',
      libraryIds: ['lib-1'],
      filtersSnapshot: { genres: ['Drama'] },
      poolSizeAtSpin: body.stats.totalMatches,
    });
    expect(body.stats.totalMatches).toBe(3);
  });

  it('records a mobile spin under the mobile user and tells their other devices', async () => {
    const friend = await seedTestUser({ plexUserId: 'friend-1', plexUsername: 'friend', isAdmin: false });
    const { accessToken } = await issueTokenPair(friend, 'device-friend');
    clearTestCookies();

    const { status, body } = await spin(DRAMA, accessToken);
    expect(status).toBe(200);

    const entries = await history(accessToken);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ userId: friend._id.toString(), plexId: body.selection.plexId });

    const changes = await SyncChange.find({ userId: friend._id, entityType: 'spin_history' }).lean();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ operation: 'upsert', entityId: entries[0]._id });

    // Nothing lands in the web user's history.
    await authenticateTestSession({ user });
    expect(await history()).toHaveLength(0);
  });

  it('records each spin, so spinning again adds one entry per spin', async () => {
    await spin(DRAMA);
    await spin(DRAMA);
    expect(await history()).toHaveLength(2);
  });

  it('records a show spin with its TV selection mode', async () => {
    fakeIntegrations(
      routes({
        [`${TEST_PLEX_SERVER}/library/sections`]: () => plexSections([{ id: 'lib-2', title: 'TV', type: 'show' }]),
        [`${TEST_PLEX_SERVER}/library/sections/lib-2/all`]: () =>
          plexLibraryItems([{ plexId: '20', title: 'A Show', type: 'show' }]),
        [`${TEST_PLEX_SERVER}/library/metadata/20`]: () => plexMetadata([{ ratingKey: '20', title: 'A Show', type: 'show' }]),
      })
    );

    const { status } = await spin({ libraryIds: ['lib-2'], mediaType: 'show', filters: {}, tvSelectionMode: 'episode' });
    expect(status).toBe(200);
    expect(await history()).toMatchObject([{ plexId: '20', mediaType: 'show', tvSelectionMode: 'episode' }]);
  });

  it('records nothing when the spin finds nothing to pick', async () => {
    const { status } = await spin({ ...DRAMA, filters: { genres: ['Western'] } });
    expect(status).toBe(404);
    expect(await history()).toHaveLength(0);
  });

  it('records nothing for a user who turned spin history off, and still spins', async () => {
    const quiet = await seedTestUser({ plexUserId: 'quiet', spinHistory: { enabled: false } });
    await authenticateTestSession({ user: quiet });

    const { status } = await spin(DRAMA);
    expect(status).toBe(200);
    expect(await history()).toHaveLength(0);
  });

  it('leaves the filters out of the entry for a user who keeps no filter snapshots', async () => {
    const plain = await seedTestUser({ plexUserId: 'plain', spinHistory: { storeFilterSnapshot: false } });
    await authenticateTestSession({ user: plain });

    await spin(DRAMA);
    const [entry] = await history();
    expect(entry.filtersSnapshot).toBeUndefined();
  });
});
