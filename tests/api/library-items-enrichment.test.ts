import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
} from '../helpers/auth';
import { LibraryCache } from '@/lib/models/LibraryCache';
import type { ILibraryItem } from '@/lib/models/LibraryCache';

const plexMock = {
  getLibrarySections: vi.fn(),
  getLibraryItems: vi.fn(),
};

const tmdbMock = {
  enrichBatch: vi.fn(),
};

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

vi.mock('@/lib/services/tmdb', () => ({
  TMDbService: vi.fn(function TMDbServiceMock() {
    return tmdbMock;
  }),
}));

vi.mock('@/lib/services/overseerr-sync', () => ({
  enrichWithOverseerr: vi.fn().mockResolvedValue(undefined),
}));

import { GET as getLibraryItems } from '@/app/api/library/[id]/items/route';

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
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings({ tmdbApiKey: 'tmdb-test-key-abcdefgh' });
    await authenticateTestSession();
    vi.clearAllMocks();

    plexMock.getLibrarySections.mockResolvedValue([
      {
        id: 'lib-1',
        title: 'Movies',
        type: 'movie',
        agent: 'com.plexapp.agents.themoviedb',
        scanner: 'Plex Movie Scanner',
        language: 'en',
        uuid: 'lib-uuid-1',
      },
    ]);
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
    plexMock.getLibraryItems.mockResolvedValue(freshPlexItems);

    const req = new NextRequest(
      'http://localhost/api/library/lib-1/items?forceRefresh=true'
    );
    const res = await getLibraryItems(req as never, {
      params: Promise.resolve({ id: 'lib-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.items[54].tmdbId).toBe('1055');
    expect(body.items[54].contentRating).toBe('PG-13');
    expect(body.items[54].studio).toBe('Test Studio');
    expect(body.items[109].tmdbId).toBe('1110');
    expect(body.items[109].contentRating).toBe('PG-13');

    expect(tmdbMock.enrichBatch).not.toHaveBeenCalled();

    const cache = await LibraryCache.findOne({ libraryId: 'lib-1' });
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

    plexMock.getLibraryItems.mockResolvedValue(allItems);

    tmdbMock.enrichBatch.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        tmdbId: 2000 + i,
        certification: 'PG',
        rating: 8.0,
        studios: ['New Studio'],
      }))
    );

    const req = new NextRequest(
      'http://localhost/api/library/lib-1/items?forceRefresh=true'
    );
    const res = await getLibraryItems(req as never, {
      params: Promise.resolve({ id: 'lib-1' }),
    });

    expect(res.status).toBe(200);

    expect(tmdbMock.enrichBatch).toHaveBeenCalledTimes(1);
    expect(tmdbMock.enrichBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Movie 100' }),
        expect.objectContaining({ title: 'Movie 109' }),
      ]),
      'movie'
    );

    const body = await res.json();
    const enrichedNewItem = body.items.find((item: ILibraryItem) => item.plexId === '100');
    expect(enrichedNewItem.tmdbId).toBe('2000');
  });

  it('serves cached items as plain, tokenless items', async () => {
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
      tmdbId: '1001',
      thumbPath: '/library/metadata/1/thumb/1',
    });
    expect(Object.keys(body.items[0]).some((key) => key.startsWith('$') || key === '_doc')).toBe(false);
    expect(JSON.stringify(body.items[0])).not.toContain('X-Plex-Token');
  });
});
