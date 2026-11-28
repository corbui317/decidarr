import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
} from '../helpers/auth';
import { LibraryCache } from '@/lib/models/LibraryCache';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { LibraryVisibility } from '@/lib/models/LibraryVisibility';
import type { IUser } from '@/lib/models/User';
import {
  fakeIntegrations,
  plexMetadata,
  plexSections,
  TMDB,
  type FakeHandler,
  type SentRequest,
} from '../helpers/fake-integrations';

import { GET as getLibraryItems } from '@/app/api/library/[id]/items/route';

/** TMDb matching "Movie <n>" to id 1900 + n, rated PG and 8.0, made by New Studio. */
const fakeTmdb: FakeHandler = ({ url }) => {
  const path = url.pathname.slice(new URL(TMDB).pathname.length);
  if (path === '/search/movie') {
    const title = url.searchParams.get('query')!;
    const n = Number(title.replace('Movie ', ''));
    return Response.json({ results: [{ id: 1900 + n, title, release_date: `${2000 + n}-01-01` }] });
  }
  if (/^\/movie\/\d+\/release_dates$/.test(path)) {
    return Response.json({ results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG' }] }] });
  }
  if (/^\/movie\/\d+$/.test(path)) {
    return Response.json({ vote_average: 8.0, production_companies: [{ name: 'New Studio' }] });
  }
  return new Response('not found', { status: 404 });
};

/** The seeded Plex server with one movie library holding `items`, plus TMDb. */
function fakePlexAndTmdb(items: ILibraryItem[]) {
  return fakeIntegrations((request) => {
    const { url } = request;
    if (url.origin === new URL(TMDB).origin) return fakeTmdb(request);
    if (url.pathname === '/library/sections') return plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]);
    if (url.pathname === '/library/sections/lib-1/all') {
      return plexMetadata(items.map(({ plexId, title, year }) => ({ ratingKey: plexId, title, year, type: 'movie' })));
    }
    return new Response('not found', { status: 404 });
  });
}

const tmdbSearches = (sent: SentRequest[]) =>
  sent.filter((r) => r.url.pathname.endsWith('/search/movie')).map((r) => r.url.searchParams.get('query'));

function makePlexItem(index: number): ILibraryItem {
  return {
    plexId: String(index),
    title: `Movie ${index}`,
    year: 2000 + index,
  };
}

function makeEnrichedItem(index: number): ILibraryItem {
  return {
    ...makePlexItem(index),
    tmdbId: String(1000 + index),
    contentRating: 'PG-13',
    rating: 7.5,
    tmdbRating: 7.5,
    studio: 'Test Studio',
    enrichedAt: new Date('2024-01-01'),
  };
}

describe('GET /api/library/[id]/items enrichment preservation', () => {
  let user: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings({ tmdbApiKey: 'tmdb-test-key-abcdefgh' });
    ({ user } = await authenticateTestSession());
    fakePlexAndTmdb([]);
  });

  it('preserves prior enrichment for items beyond the batch limit on refresh', async () => {
    const existingItems = Array.from({ length: 110 }, (_, i) => makeEnrichedItem(i + 1));

    await LibraryCache.create({
      plexMachineId: 'machine-1',
      libraryId: 'lib-1',
      libraryName: 'Movies',
      mediaType: 'movie',
      items: existingItems,
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const freshPlexItems = Array.from({ length: 110 }, (_, i) => makePlexItem(i + 1));
    const { sent } = fakePlexAndTmdb(freshPlexItems);

    const req = new NextRequest(
      'http://localhost/api/library/lib-1/items?forceRefresh=true'
    );
    const res = await getLibraryItems(req as never, {
      params: Promise.resolve({ id: 'lib-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items[54].contentRating).toBe('PG-13');
    expect(body.items[54].studio).toBe('Test Studio');
    expect(body.items[109].contentRating).toBe('PG-13');

    expect(tmdbSearches(sent)).toEqual([]);

    const cache = await LibraryCache.findOne({ libraryId: 'lib-1' });
    expect(cache?.items[54].tmdbId).toBe('1055');
    expect(cache?.items[109].tmdbId).toBe('1110');
    expect(cache?.items[54].contentRating).toBe('PG-13');
  });

  it('enriches new items even when unmatchable items exist', async () => {
    const unmatchableItems = Array.from({ length: 60 }, (_, i) => ({
      ...makePlexItem(i + 1),
      attemptedEnrichmentAt: new Date(Date.now() - 1000),
    }));

    const newItems = Array.from({ length: 10 }, (_, i) => makePlexItem(100 + i));

    const allItems = [...unmatchableItems, ...newItems];

    await LibraryCache.create({
      plexMachineId: 'machine-1',
      libraryId: 'lib-1',
      libraryName: 'Movies',
      mediaType: 'movie',
      items: unmatchableItems,
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const { sent } = fakePlexAndTmdb(allItems);

    const req = new NextRequest(
      'http://localhost/api/library/lib-1/items?forceRefresh=true'
    );
    const res = await getLibraryItems(req as never, {
      params: Promise.resolve({ id: 'lib-1' }),
    });

    expect(res.status).toBe(200);

    expect(tmdbSearches(sent)).toEqual(newItems.map((item) => item.title));
    expect(sent.filter((r) => r.url.pathname.endsWith('/search/movie')).every((r) => r.url.searchParams.get('api_key') === 'tmdb-test-key-abcdefgh')).toBe(true);

    const body = await res.json();
    const enrichedNewItem = body.items.find((item: ILibraryItem) => item.plexId === '100');
    expect(enrichedNewItem).toMatchObject({ contentRating: 'PG', studio: 'New Studio' });
    const cache = await LibraryCache.findOne({ libraryId: 'lib-1' });
    expect(cache?.items.find((item) => item.plexId === '100')?.tmdbId).toBe('2000');
  });

  it('serves cached items as plain, tokenless items', async () => {
    const expiresAt = new Date(Date.now() + 86400000);
    // Cached before tokenless image paths, and already synced for this user.
    await LibraryVisibility.create({
      userId: user._id,
      plexMachineId: 'machine-1',
      libraryId: 'lib-1',
      plexIds: ['1'],
      lastSyncedAt: new Date(),
      expiresAt,
    });
    await LibraryCache.create({
      plexMachineId: 'machine-1',
      libraryId: 'lib-1',
      libraryName: 'Movies',
      mediaType: 'movie',
      items: [
        {
          ...makeEnrichedItem(1),
          posterUrl: 'http://192.168.1.10:32400/library/metadata/1/thumb/1?X-Plex-Token=secret',
        },
      ],
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await getLibraryItems(new NextRequest('http://localhost/api/library/lib-1/items') as never, {
      params: Promise.resolve({ id: 'lib-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fromCache).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      plexId: '1',
      title: 'Movie 1',
      thumbPath: '/library/metadata/1/thumb/1',
    });
    // Enrichment bookkeeping stays on the server: it is not in the item contract.
    for (const internal of ['tmdbId', 'tmdbRating', 'enrichedAt']) {
      expect(body.items[0]).not.toHaveProperty(internal);
    }
    expect(Object.keys(body.items[0]).some((key) => key.startsWith('$') || key === '_doc')).toBe(false);
    expect(JSON.stringify(body.items[0])).not.toContain('X-Plex-Token');
  });
});
