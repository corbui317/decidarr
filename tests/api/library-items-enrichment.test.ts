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
});
