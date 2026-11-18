import { vi, describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import { LibraryCache } from '@/lib/models/LibraryCache';

const plexMock = {
  validateToken: vi.fn(),
  getServers: vi.fn(),
  getLibrarySections: vi.fn(),
  getCollectionItems: vi.fn(),
  getItemMetadata: vi.fn(),
  fetchMachineIdFromServer: vi.fn(),
  buildPlayLinks: vi.fn(),
};

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    getTmdbApiKey: vi.fn().mockResolvedValue(null),
  };
});

import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';

async function seedLibraryCache() {
  await LibraryCache.create({
    plexMachineId: 'machine-1',
    libraryId: 'lib-1',
    libraryName: 'Movies',
    mediaType: 'movie',
    items: SAMPLE_LIBRARY_ITEMS,
    lastSyncedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });
}

describe('Selection API validation', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
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
    plexMock.getItemMetadata.mockResolvedValue({
      plexId: '1',
      title: 'Inception',
      year: 2010,
      type: 'movie',
    });
    plexMock.buildPlayLinks.mockReturnValue({ web: 'https://app.plex.tv', app: 'plex://' });
    plexMock.fetchMachineIdFromServer.mockResolvedValue('machine-1');
  });

  describe('POST /api/selection/pool-count', () => {
    it('returns 400 for invalid mediaType', async () => {
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'invalid',
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("mediaType must be 'movie' or 'show'");
    });

    it('returns 400 when filters.collections is not an array', async () => {
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { collections: 'not-an-array' },
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('filters.collections must be an array of strings');
    });

    it('still returns zero pool for empty libraryIds', async () => {
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: [],
        mediaType: 'movie',
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.matchingItems).toBe(0);
      expect(body.emptyReason).toMatch(/No libraries/i);
    });

    it('returns matching count for valid payload after validation', async () => {
      await seedLibraryCache();
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { genres: ['Sci-Fi'] },
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.matchingItems).toBe(1);
    });
  });

  describe('POST /api/selection/random', () => {
    it('returns 400 with existing message for empty libraryIds', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: [],
        mediaType: 'movie',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('At least one library must be selected');
    });

    it('returns 400 for invalid mediaType', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'invalid',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("mediaType must be 'movie' or 'show'");
    });

    it('returns selection for valid payload after validation', async () => {
      await seedLibraryCache();
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: {},
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.selection.title).toBe('Inception');
    });
  });
});
