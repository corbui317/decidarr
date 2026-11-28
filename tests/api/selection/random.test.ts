import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../../fixtures/library-items';
import {
  fakeIntegrations,
  plexLibraryItems,
  plexMetadata,
  plexSections,
  routes,
  TEST_PLEX_SERVER,
} from '../../helpers/fake-integrations';

import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';

const SAMPLE_TITLES = SAMPLE_LIBRARY_ITEMS.map((item) => item.title);

/** The seeded Plex server: one movie library holding `items`. */
function fakePlexServer(items = SAMPLE_LIBRARY_ITEMS) {
  return fakeIntegrations(
    routes({
      [`${TEST_PLEX_SERVER}/library/sections`]: () => plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
      [`${TEST_PLEX_SERVER}/library/sections/lib-1/all`]: () => plexLibraryItems(items),
      ...Object.fromEntries(
        SAMPLE_LIBRARY_ITEMS.map(({ plexId, title, year }) => [
          `${TEST_PLEX_SERVER}/library/metadata/${plexId}`,
          () => plexMetadata([{ ratingKey: plexId, title, year, type: 'movie' }]),
        ])
      ),
    })
  );
}

describe('Selection API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    await authenticateTestSession();
    fakePlexServer();
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

    it('returns 404 when the library is empty', async () => {
      fakePlexServer([]);
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(404);
    });

    it('returns 404 when filters match nothing', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { genres: ['Western'] },
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(404);
    });

    it('returns selection on success', async () => {
      const req = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: {},
      });
      const res = await randomPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(SAMPLE_TITLES).toContain(body.selection.title);
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
  });
});
