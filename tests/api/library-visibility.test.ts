import { describe, it, expect, beforeEach } from 'vitest';
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
} from '../helpers/fake-integrations';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
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
function fakeRestrictedPlex(views: Record<string, ILibraryItem[]>) {
  return fakeIntegrations(({ url, headers }) => {
    const view = views[headers.get('X-Plex-Token') ?? ''];
    if (url.origin !== TEST_PLEX_SERVER || !view) return new Response('unauthorized', { status: 401 });
    if (url.pathname === '/library/sections') return plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]);
    if (url.pathname === '/library/sections/lib-1/all') return plexLibraryItems(view);
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

async function getJson(handler: (req: NextRequest) => Promise<Response>, path: string) {
  const res = await handler(new NextRequest(`http://localhost${path}?libraryIds=lib-1`));
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
});
