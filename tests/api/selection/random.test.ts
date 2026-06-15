import { vi, describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../../fixtures/library-items';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';

const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

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
    userId: SINGLE_USER_ID,
    libraryId: 'lib-1',
    libraryName: 'Movies',
    mediaType: 'movie',
    items: SAMPLE_LIBRARY_ITEMS,
    lastSyncedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  });
}

describe('Selection API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    await authenticateTestSession();
    vi.clearAllMocks();
    plexMock.getItemMetadata.mockResolvedValue({
      plexId: '1',
      title: 'Inception',
      year: 2010,
      type: 'movie',
    });
    plexMock.buildPlayLinks.mockReturnValue({ web: 'https://app.plex.tv', app: 'plex://' });
    plexMock.fetchMachineIdFromServer.mockResolvedValue('machine-1');
  });

  describe('POST /api/selection/random', () => {
    it('returns 400 without library ids', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: [],
        mediaType: 'movie',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(400);
    });

    it('returns 401 without session', async () => {
      clearTestCookies();
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(401);
    });

    it('returns 404 when library cache empty', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(404);
    });

    it('returns 404 when filters match nothing', async () => {
      await seedLibraryCache();
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { genres: ['Western'] },
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(404);
    });

    it('returns selection on success', async () => {
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
      expect(body.stats.totalMatches).toBeGreaterThan(0);
    });
  });

  describe('POST /api/selection/pool-count', () => {
    it('returns zero pool when no libraries selected', async () => {
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: [],
        mediaType: 'movie',
      });
      const res = await poolCountPost(req as never);
      const body = await res.json();
      expect(body.matchingItems).toBe(0);
      expect(body.emptyReason).toMatch(/No libraries/i);
    });

    it('returns matching count consistent with filters', async () => {
      await seedLibraryCache();
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { genres: ['Sci-Fi'] },
      });
      const res = await poolCountPost(req as never);
      const body = await res.json();
      expect(body.matchingItems).toBe(1);
      expect(body.totalItems).toBe(SAMPLE_LIBRARY_ITEMS.length);
    });

    it('reports emptyReason for impossible genre filter', async () => {
      await seedLibraryCache();
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { genres: ['Western'] },
      });
      const res = await poolCountPost(req as never);
      const body = await res.json();
      expect(body.matchingItems).toBe(0);
      expect(body.emptyReason).toBeTruthy();
    });

    it('parity: pool count matches random eligibility with unwatched filter', async () => {
      await seedLibraryCache();
      await WatchedItem.create({
        userId: SINGLE_USER_ID,
        plexId: '1',
        title: 'Inception',
        mediaType: 'movie',
        watchedAt: new Date(),
        source: 'manual',
      });

      const poolReq = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { unwatchedOnly: true },
      });
      const poolRes = await poolCountPost(poolReq as never);
      const poolBody = await poolRes.json();

      const randomReq = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { unwatchedOnly: true },
      });
      const randomRes = await randomPost(randomReq as never);
      const randomBody = await randomRes.json();

      expect(poolBody.matchingItems).toBe(randomBody.stats.totalMatches);
    });
  });
});
