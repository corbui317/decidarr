import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  seedTestUser,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
  TEST_SERVER_TOKEN,
} from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import {
  fakeIntegrations,
  plexLibraryItems,
  plexSections,
  TEST_PLEX_SERVER,
  TMDB,
} from '../helpers/fake-integrations';
import { LibraryCache, type ILibraryItem } from '@/lib/models/LibraryCache';
import { LibraryVisibility } from '@/lib/models/LibraryVisibility';
import type { IUser } from '@/lib/models/User';

import { GET as itemsGet } from '@/app/api/library/[id]/items/route';
import { GET as genresGet } from '@/app/api/library/genres/route';
import { GET as yearsGet } from '@/app/api/library/years/route';
import { GET as filterOptionsGet } from '@/app/api/library/filter-options/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';
import { POST as randomPost } from '@/app/api/selection/random/route';

const FRIEND_SERVER_TOKEN = 'friend-server-token-abcdefghijk';

/** The Admin sees all six sample titles. */
const ADMIN_VIEW = SAMPLE_LIBRARY_ITEMS;
/** The Admin shares only PG and PG-13 titles with the Friend: Inception, Hidden Gem Film, Old Classic. */
const FRIEND_VIEW = SAMPLE_LIBRARY_ITEMS.filter((item) => item.contentRating === 'PG' || item.contentRating === 'PG-13');
const RESTRICTED_TITLES = ['The Room', 'Parasite', 'No Rating Movie'];

/**
 * The Plex server, which answers each user with what their own server token lets them see,
 * as Plex does for a Friend with label or content-rating restrictions.
 */
interface FakePlexControl {
  listing: 'up' | 'unreachable' | 'failing';
  /** Runs while a listing is in flight, after Plex has decided what the user sees. */
  whileListing?: () => void | Promise<void>;
  /** Runs on each TMDb request (TMDb finds nothing). */
  onTmdb?: () => void;
}

function fakeRestrictedPlex(views: Record<string, ILibraryItem[]>, plex: FakePlexControl = { listing: 'up' }) {
  return fakeIntegrations(async ({ url, headers }) => {
    if (url.href.startsWith(TMDB)) {
      plex.onTmdb?.();
      return Response.json({ results: [] });
    }
    // A large library's listing can time out or fail while Plex still answers its section list.
    if (url.pathname.endsWith('/all') && plex.listing === 'unreachable') throw new TypeError('fetch failed');
    if (url.pathname.endsWith('/all') && plex.listing === 'failing') return new Response('busy', { status: 503 });
    const view = views[headers.get('X-Plex-Token') ?? ''];
    if (url.origin !== TEST_PLEX_SERVER || !view) return new Response('unauthorized', { status: 401 });
    if (url.pathname === '/library/sections') return plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]);
    if (url.pathname === '/library/sections/lib-1/all') {
      await plex.whileListing?.();
      return plexLibraryItems(view);
    }
    const plexId = url.pathname.match(/^\/library\/metadata\/(\w+)$/)?.[1];
    const item = view.find((candidate) => candidate.plexId === plexId);
    return item ? plexLibraryItems([item]) : new Response('not found', { status: 404 });
  });
}

const selection = { libraryIds: ['lib-1'], mediaType: 'movie', filters: {} };

async function loadItems(options: { forceRefresh?: boolean } = {}) {
  const query = options.forceRefresh ? '?forceRefresh=true' : '';
  const res = await itemsGet(new NextRequest(`http://localhost/api/library/lib-1/items${query}`) as never, {
    params: Promise.resolve({ id: 'lib-1' }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { items: ILibraryItem[]; fromCache: boolean };
}

function get(handler: (req: NextRequest) => Promise<Response>, path: string) {
  return handler(new NextRequest(`http://localhost${path}?libraryIds=lib-1`));
}

async function getJson(handler: (req: NextRequest) => Promise<Response>, path: string) {
  const res = await get(handler, path);
  expect(res.status).toBe(200);
  return res.json();
}

async function poolCount() {
  const res = await poolCountPost(createJsonRequest('http://localhost/api/selection/pool-count', 'POST', selection) as never);
  expect(res.status).toBe(200);
  return (await res.json()) as { totalItems: number; matchingItems: number };
}

async function spin() {
  const res = await randomPost(createJsonRequest('http://localhost/api/selection/random', 'POST', selection) as never);
  expect(res.status).toBe(200);
  return (await res.json()) as { selection: { title: string }; stats: { totalMatches: number } };
}

const titles = (items: ILibraryItem[]) => items.map((item) => item.title).sort();

describe('Library visibility follows each user\'s own Plex view', () => {
  let admin: IUser;
  let friend: IUser;
  let views: Record<string, ILibraryItem[]>;

  const signInAs = (user: IUser) => authenticateTestSession({ user });

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    admin = await seedTestUser({ plexUserId: 'admin-1', plexUsername: 'admin', isAdmin: true });
    friend = await seedTestUser({
      plexUserId: 'friend-1',
      plexUsername: 'friend',
      isAdmin: false,
      serverToken: FRIEND_SERVER_TOKEN,
    });
    views = { [TEST_SERVER_TOKEN]: ADMIN_VIEW, [FRIEND_SERVER_TOKEN]: FRIEND_VIEW };
    fakeRestrictedPlex(views);
  });

  it('never gives a restricted Friend the titles the Admin loaded', async () => {
    await signInAs(admin);
    expect(titles((await loadItems()).items)).toEqual(titles(ADMIN_VIEW));

    await signInAs(friend);

    expect(titles((await loadItems()).items)).toEqual(titles(FRIEND_VIEW));

    const { genres } = await getJson(genresGet, '/api/library/genres');
    expect(genres).toEqual(['Action', 'Adventure', 'Drama', 'Sci-Fi']);

    expect(await getJson(yearsGet, '/api/library/years')).toEqual({ min: 1985, max: 2015 });

    const options = await getJson(filterOptionsGet, '/api/library/filter-options');
    expect(options.contentRatings).toEqual(['PG', 'PG-13']);
    expect(options.studios).toEqual(['Indie Studio', 'Universal Pictures', 'Warner Bros']);
    expect(options.ratingRange).toEqual({ min: 7, max: 9 });

    expect(await poolCount()).toMatchObject({ totalItems: FRIEND_VIEW.length, matchingItems: FRIEND_VIEW.length });

    for (let i = 0; i < 10; i++) {
      const result = await spin();
      expect(result.stats.totalMatches).toBe(FRIEND_VIEW.length);
      expect(RESTRICTED_TITLES).not.toContain(result.selection.title);
    }
  });

  it("never shrinks the Admin's pool to what a Friend who loaded first can see", async () => {
    await signInAs(friend);
    await loadItems();

    await signInAs(admin);
    expect(titles((await loadItems()).items)).toEqual(titles(ADMIN_VIEW));
    expect(await poolCount()).toMatchObject({ totalItems: ADMIN_VIEW.length });
  });

  it("a Friend's forced refresh changes only the Friend's own pool", async () => {
    await signInAs(admin);
    await loadItems();
    await signInAs(friend);
    await loadItems();

    // The Admin tightens the Friend's restrictions in Plex; the Friend refreshes.
    views[FRIEND_SERVER_TOKEN] = FRIEND_VIEW.slice(0, 1);
    expect(titles((await loadItems({ forceRefresh: true })).items)).toEqual([FRIEND_VIEW[0].title]);
    expect(await poolCount()).toMatchObject({ totalItems: 1 });

    await signInAs(admin);
    expect(await poolCount()).toMatchObject({ totalItems: ADMIN_VIEW.length });
    expect(titles((await loadItems()).items)).toEqual(titles(ADMIN_VIEW));
  });

  it("the Admin's forced refresh never widens a Friend's pool", async () => {
    await signInAs(friend);
    await loadItems();

    await signInAs(admin);
    await loadItems({ forceRefresh: true });

    await signInAs(friend);
    expect(await poolCount()).toMatchObject({ totalItems: FRIEND_VIEW.length });
    expect(titles((await loadItems()).items)).toEqual(titles(FRIEND_VIEW));
  });

  it('rebuilds each user\'s view from Plex on upgrade, never serving a cache filled before visibility sets existed', async () => {
    // An install upgraded from a single shared cache that the Admin's view filled.
    await LibraryCache.create({
      plexMachineId: 'machine-1',
      libraryId: 'lib-1',
      libraryName: 'Movies',
      mediaType: 'movie',
      items: ADMIN_VIEW,
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    await signInAs(friend);
    expect(await poolCount()).toMatchObject({ totalItems: FRIEND_VIEW.length });

    await signInAs(admin);
    expect(await poolCount()).toMatchObject({ totalItems: ADMIN_VIEW.length });
  });

  it("re-syncs a user whose view names items the shared metadata lost, so another user's sync never shrinks it", async () => {
    await signInAs(admin);
    await loadItems();
    await signInAs(friend);
    await loadItems();

    // The shared metadata expires and is removed; the Friend syncs first and refills it with their view only.
    await LibraryCache.deleteMany({});
    await loadItems({ forceRefresh: true });

    await signInAs(admin);
    expect(await poolCount()).toMatchObject({ totalItems: ADMIN_VIEW.length });
  });
});

/** How stale a Friend's visible set may be: a restriction the Admin tightens in Plex applies within this. */
const VISIBILITY_BOUND_MS = 60_000;

describe('A restriction the Admin tightens in Plex reaches the Friend within the bound', () => {
  let admin: IUser;
  let friend: IUser;
  let views: Record<string, ILibraryItem[]>;
  let plex: FakePlexControl;
  let sent: { url: URL; headers: Headers }[];

  /** Only Old Classic (PG) stays shared with the Friend; Inception and Hidden Gem Film become restricted. */
  const TIGHTENED_VIEW = FRIEND_VIEW.filter((item) => item.contentRating === 'PG');
  const NEWLY_RESTRICTED = ['Inception', 'Hidden Gem Film'];

  const signInAs = (user: IUser) => authenticateTestSession({ user });
  const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
  const listingsFor = (token: string) =>
    sent.filter(({ url, headers }) => url.pathname === '/library/sections/lib-1/all' && headers.get('X-Plex-Token') === token)
      .length;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    admin = await seedTestUser({ plexUserId: 'admin-1', plexUsername: 'admin', isAdmin: true });
    friend = await seedTestUser({
      plexUserId: 'friend-1',
      plexUsername: 'friend',
      isAdmin: false,
      serverToken: FRIEND_SERVER_TOKEN,
    });
    views = { [TEST_SERVER_TOKEN]: ADMIN_VIEW, [FRIEND_SERVER_TOKEN]: FRIEND_VIEW };
    plex = { listing: 'up' };
    ({ sent } = fakeRestrictedPlex(views, plex));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves no newly restricted title from items, facets, filter options, pool count or spin once the bound has passed', async () => {
    await signInAs(friend);
    expect(titles((await loadItems()).items)).toEqual(titles(FRIEND_VIEW));

    views[FRIEND_SERVER_TOKEN] = TIGHTENED_VIEW;
    advance(VISIBILITY_BOUND_MS + 1);

    expect(titles((await loadItems()).items)).toEqual(titles(TIGHTENED_VIEW));
    expect((await getJson(genresGet, '/api/library/genres')).genres).toEqual(['Adventure']);
    expect(await getJson(yearsGet, '/api/library/years')).toEqual({ min: 1985, max: 1985 });
    const options = await getJson(filterOptionsGet, '/api/library/filter-options');
    expect(options.contentRatings).toEqual(['PG']);
    expect(options.studios).toEqual(['Universal Pictures']);
    expect(await poolCount()).toMatchObject({ totalItems: 1, matchingItems: 1 });
    for (let i = 0; i < 5; i++) {
      const result = await spin();
      expect(NEWLY_RESTRICTED).not.toContain(result.selection.title);
      expect(result.stats.totalMatches).toBe(1);
    }
  });

  it('costs no Plex listing within the bound, and one shared listing per user and library past it', async () => {
    await signInAs(friend);
    await loadItems();
    const afterFirstSync = listingsFor(FRIEND_SERVER_TOKEN);

    advance(VISIBILITY_BOUND_MS - 1_000);
    await poolCount();
    await getJson(filterOptionsGet, '/api/library/filter-options');
    expect(listingsFor(FRIEND_SERVER_TOKEN)).toBe(afterFirstSync);

    advance(2_000);
    await Promise.all([poolCount(), poolCount(), loadItems(), getJson(genresGet, '/api/library/genres')]);
    expect(listingsFor(FRIEND_SERVER_TOKEN)).toBe(afterFirstSync + 1);
  });

  it("a Friend's refresh past the bound changes only the Friend's visible set and the shared metadata", async () => {
    await signInAs(admin);
    await loadItems();
    await signInAs(friend);
    await loadItems();
    const adminSet = await LibraryVisibility.findOne({ userId: admin._id.toString() }).lean();

    views[FRIEND_SERVER_TOKEN] = TIGHTENED_VIEW;
    advance(VISIBILITY_BOUND_MS + 1);
    expect(await poolCount()).toMatchObject({ totalItems: 1 });

    expect(await LibraryVisibility.findOne({ userId: admin._id.toString() }).lean()).toEqual(adminSet);
    const shared = await LibraryCache.findOne({ libraryId: 'lib-1' }).lean();
    expect(titles(shared!.items)).toEqual(titles(ADMIN_VIEW));

    await signInAs(admin);
    expect(await poolCount()).toMatchObject({ totalItems: ADMIN_VIEW.length });
  });

  it('measures the bound from when Plex was asked, not from when a slow sync finished enriching', async () => {
    await seedConfiguredSettings({ tmdbApiKey: 'tmdb-test-key-abcdefgh' });
    let enrichmentSlow = true;
    plex.onTmdb = () => {
      if (enrichmentSlow) advance(50_000);
      enrichmentSlow = false;
    };
    // Without a studio from Plex, each title is looked up on TMDb.
    const withoutStudio = (items: ILibraryItem[]) => items.map((item) => ({ ...item, studio: undefined }));
    views[FRIEND_SERVER_TOKEN] = withoutStudio(FRIEND_VIEW);
    await signInAs(friend);
    expect(titles((await loadItems()).items)).toEqual(titles(FRIEND_VIEW));

    expect(enrichmentSlow).toBe(false);

    // Listed at T, written at T + 50 s; the Admin tightens right after the listing.
    views[FRIEND_SERVER_TOKEN] = withoutStudio(TIGHTENED_VIEW);
    advance(VISIBILITY_BOUND_MS - 50_000 + 1);

    expect(titles((await loadItems()).items)).toEqual(titles(TIGHTENED_VIEW));
  });

  it('measures a confirmation from when its listing was requested, not from when it returned', async () => {
    await signInAs(friend);
    await loadItems();
    advance(VISIBILITY_BOUND_MS + 1);

    plex.whileListing = () => {
      plex.whileListing = undefined;
      advance(50_000);
    };
    expect(titles((await loadItems()).items)).toEqual(titles(FRIEND_VIEW));

    views[FRIEND_SERVER_TOKEN] = TIGHTENED_VIEW;
    advance(VISIBILITY_BOUND_MS - 50_000 + 1);

    expect(titles((await loadItems()).items)).toEqual(titles(TIGHTENED_VIEW));
  });

  it('never lets a slow sync that listed before a restriction change overwrite a newer confirmation', async () => {
    await signInAs(friend);
    await loadItems();
    advance(VISIBILITY_BOUND_MS + 1);

    let release!: () => void;
    let listed!: () => void;
    const stalled = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (listed = resolve));
    plex.whileListing = async () => {
      plex.whileListing = undefined;
      listed();
      await stalled;
    };
    // A forced refresh lists the Friend's current view, then stalls before storing it.
    const slowRefresh = loadItems({ forceRefresh: true });
    await reached;

    views[FRIEND_SERVER_TOKEN] = TIGHTENED_VIEW;
    advance(1_000);
    expect(await poolCount()).toMatchObject({ totalItems: TIGHTENED_VIEW.length });

    release();
    await slowRefresh;
    expect(await poolCount()).toMatchObject({ totalItems: TIGHTENED_VIEW.length });
    expect(titles((await loadItems()).items)).toEqual(titles(TIGHTENED_VIEW));
  });

  it.each(['unreachable', 'failing'] as const)("serves no title Plex has not confirmed for the Friend once the bound has passed while Plex is %s", async (listing) => {
    await signInAs(friend);
    await loadItems();

    plex.listing = listing;
    advance(VISIBILITY_BOUND_MS + 1);

    const responses = await Promise.all([
      itemsGet(new NextRequest('http://localhost/api/library/lib-1/items') as never, { params: Promise.resolve({ id: 'lib-1' }) }),
      get(genresGet, '/api/library/genres'),
      get(filterOptionsGet, '/api/library/filter-options'),
      poolCountPost(createJsonRequest('http://localhost/api/selection/pool-count', 'POST', selection) as never),
      randomPost(createJsonRequest('http://localhost/api/selection/random', 'POST', selection) as never),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe('INTEGRATION_UNAVAILABLE');
    }
  });

  it('still asks the Friend to sign in again when Plex refuses their token past the bound', async () => {
    await signInAs(friend);
    await loadItems();

    delete views[FRIEND_SERVER_TOKEN];
    advance(VISIBILITY_BOUND_MS + 1);

    const res = await poolCountPost(createJsonRequest('http://localhost/api/selection/pool-count', 'POST', selection) as never);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');
  });
});
