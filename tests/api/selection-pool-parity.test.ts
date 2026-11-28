import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IUser } from '@/lib/models/User';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import {
  fakeIntegrations,
  plexMetadata,
  plexSections,
  routes,
  TEST_PLEX_SERVER,
} from '../helpers/fake-integrations';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache, type ILibraryItem } from '@/lib/models/LibraryCache';
import { LibraryVisibility } from '@/lib/models/LibraryVisibility';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';

import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';

/**
 * Pool count versus Spin: for the same Session and parameters, the count shown must be
 * exactly the number of items Spin can pick. Each case narrows the library with one
 * filter, so a filter that only one of the two applies changes one side and not the other.
 */

/** The sample movies; Old Classic (5) is already fully available in Overseerr. */
const LIBRARY: ILibraryItem[] = SAMPLE_LIBRARY_ITEMS.map((item) =>
  item.plexId === '5' ? { ...item, overseerrStatus: 'available' } : item
);
const ALL = LIBRARY.map((item) => item.plexId);

/** Seeds the user's cached, current view of lib-1, so the pool needs no Plex library listing. */
async function seedLibraryView(user: IUser) {
  const expiresAt = new Date(Date.now() + 86_400_000);
  await LibraryCache.create({
    plexMachineId: 'machine-1',
    libraryId: 'lib-1',
    libraryName: 'Movies',
    mediaType: 'movie',
    items: LIBRARY,
    lastSyncedAt: new Date(),
    expiresAt,
  });
  await LibraryVisibility.create({
    userId: user._id,
    plexMachineId: 'machine-1',
    libraryId: 'lib-1',
    plexIds: ALL,
    lastSyncedAt: new Date(),
    expiresAt,
  });
}

function fakePlexServer() {
  return fakeIntegrations(
    routes({
      [`${TEST_PLEX_SERVER}/library/sections`]: () => plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
      ...Object.fromEntries(
        LIBRARY.map(({ plexId, title, year }) => [
          `${TEST_PLEX_SERVER}/library/metadata/${plexId}`,
          () => plexMetadata([{ ratingKey: plexId, title, year, type: 'movie' }]),
        ])
      ),
      [`${TEST_PLEX_SERVER}/library/collections/201/children`]: () =>
        plexMetadata([
          { ratingKey: '1', title: 'Inception' },
          { ratingKey: '2', title: 'The Room' },
          { ratingKey: '4', title: 'Hidden Gem Film' },
        ]),
    })
  );
}

type Params = { libraryIds: string[]; mediaType: 'movie' | 'show'; filters: Record<string, unknown> };

function request(path: string, params: Params, bearer?: string): Request {
  const req = createJsonRequest(`http://localhost/api/selection/${path}`, 'POST', params);
  if (bearer) req.headers.set('Authorization', `Bearer ${bearer}`);
  return req;
}

async function poolCount(params: Params, bearer?: string): Promise<number> {
  const res = await poolCountPost(request('pool-count', params, bearer) as never);
  expect(res.status).toBe(200);
  return (await res.json()).matchingItems;
}

/**
 * Every item Spin can pick: one spin per position of the pool Spin reports, steering its
 * random draw to each position in turn.
 */
async function pickableItems(params: Params, bearer?: string): Promise<string[]> {
  const spin = async () => {
    const res = await randomPost(request('random', params, bearer) as never);
    return { status: res.status, body: await res.json() };
  };

  const first = await spin();
  // No pool to pick from: nothing in the libraries, nothing matching, or no accessible library.
  if (first.status === 404 || first.status === 403) return [];
  expect(first.status).toBe(200);

  const size: number = first.body.stats.totalMatches;
  const picked = new Set<string>();
  const random = vi.spyOn(Math, 'random');
  try {
    for (let position = 0; position < size; position++) {
      random.mockReturnValue((position + 0.5) / size);
      const { status, body } = await spin();
      expect(status).toBe(200);
      expect(body.stats.totalMatches).toBe(size);
      picked.add(body.selection.plexId);
    }
  } finally {
    random.mockRestore();
  }
  return [...picked].sort();
}

const lib1 = (filters: Record<string, unknown>): Params => ({ libraryIds: ['lib-1'], mediaType: 'movie', filters });

const CASES: Array<{ name: string; params: Params; expected: string[] }> = [
  { name: 'no filters', params: lib1({}), expected: ['1', '2', '3', '4', '6'] },
  { name: 'genres', params: lib1({ genres: ['Drama'] }), expected: ['2', '3', '4'] },
  { name: 'year range', params: lib1({ yearRange: { start: 2010, end: 2019 } }), expected: ['1', '3', '4'] },
  { name: 'age ratings', params: lib1({ contentRatings: ['R'] }), expected: ['2', '3'] },
  { name: 'studios', params: lib1({ studios: ['netflix'] }), expected: ['6'] },
  { name: 'score range', params: lib1({ ratingRange: { min: 7, max: 8.6 } }), expected: ['3', '4'] },
  { name: 'score preset', params: lib1({ ratingFilter: 'top_rated' }), expected: ['1', '3'] },
  { name: 'unwatched only', params: lib1({ unwatchedOnly: true }), expected: ['4', '6'] },
  { name: 'collections', params: lib1({ collections: ['201'] }), expected: ['1', '2', '4'] },
  {
    name: 'every filter at once',
    params: lib1({
      genres: ['Drama', 'Sci-Fi'],
      yearRange: { start: 2000 },
      contentRatings: ['R', 'PG-13'],
      studios: ['films', 'entertainment', 'indie'],
      ratingRange: { min: 3 },
      unwatchedOnly: true,
      collections: ['201'],
    }),
    expected: ['4'],
  },
  {
    name: 'a library selected twice',
    params: { libraryIds: ['lib-1', 'lib-1'], mediaType: 'movie', filters: {} },
    expected: ['1', '2', '3', '4', '6'],
  },
  { name: 'a media type the library does not hold', params: { ...lib1({}), mediaType: 'show' }, expected: [] },
  { name: 'a library the user cannot access', params: { ...lib1({}), libraryIds: ['lib-9'] }, expected: [] },
];

describe('Selection pool: pool count equals what Spin can pick', () => {
  let user: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    const settings = await seedConfiguredSettings();
    // The Overseerr filter is on for every case: Old Classic is never in the pool.
    settings.overseerrFilterEnabled = true;
    await settings.save();
    ({ user } = await authenticateTestSession());
    await seedLibraryView(user);
    // Inception, The Room and Parasite are watched; they leave the pool only with "unwatched only".
    await WatchedItem.create([
      { userId: user._id, plexId: '1', title: 'Inception', mediaType: 'movie', watchedAt: new Date(), source: 'manual' },
      { userId: user._id, plexId: '2', title: 'The Room', mediaType: 'movie', watchedAt: new Date(), source: 'manual' },
      { userId: user._id, plexId: '3', title: 'Parasite', mediaType: 'movie', watchedAt: new Date(), source: 'manual' },
    ]);
    fakePlexServer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(CASES)('$name', async ({ params, expected }) => {
    const count = await poolCount(params);
    const pickable = await pickableItems(params);

    expect(pickable).toEqual(expected);
    expect(count).toBe(pickable.length);
  });

  it('counts Overseerr-available titles again once the Admin turns that filter off', async () => {
    const settings = await getOrCreateSettings();
    settings.overseerrFilterEnabled = false;
    await settings.save();

    const count = await poolCount(lib1({}));
    const pickable = await pickableItems(lib1({}));
    expect(pickable).toEqual(ALL);
    expect(count).toBe(pickable.length);
  });

  it('gives the mobile app the same pool as the web app for the same parameters', async () => {
    const { accessToken } = await issueTokenPair(user, 'device-parity');
    const params = lib1({ genres: ['Drama', 'Documentary'], unwatchedOnly: true });

    const web = { count: await poolCount(params), pickable: await pickableItems(params) };
    clearTestCookies();
    const mobile = { count: await poolCount(params, accessToken), pickable: await pickableItems(params, accessToken) };

    expect(web).toEqual({ count: 2, pickable: ['4', '6'] });
    expect(mobile).toEqual(web);
  });
});
