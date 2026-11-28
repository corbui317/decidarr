import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
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
  type SentRequest,
} from '../../helpers/fake-integrations';
import { WatchedItem } from '@/lib/models/WatchedItem';

let authenticatedUserId: mongoose.Types.ObjectId;

import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';

const SAMPLE_TITLES = SAMPLE_LIBRARY_ITEMS.map((item) => item.title);

/** The seeded Plex server: one movie library holding `items`, and a two-item collection. */
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
      [`${TEST_PLEX_SERVER}/library/collections/col-1/children`]: () =>
        plexMetadata([
          { ratingKey: '1', title: 'Inception' },
          { ratingKey: '2', title: 'The Matrix' },
        ]),
    })
  );
}

describe('Selection API routes', () => {
  let sent: SentRequest[];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const auth = await authenticateTestSession();
    authenticatedUserId = auth.user._id as mongoose.Types.ObjectId;
    ({ sent } = fakePlexServer());
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

    it('parity: pool count matches random eligibility with unwatched filter', async () => {
      await WatchedItem.create({
        userId: authenticatedUserId,
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

    it('parity: pool count matches random eligibility with collection filter', async () => {

      const poolReq = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { collections: ['col-1'] },
      });
      const poolRes = await poolCountPost(poolReq as never);
      const poolBody = await poolRes.json();

      const randomReq = createJsonRequest('http://localhost/api/selection/random', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { collections: ['col-1'] },
      });
      const randomRes = await randomPost(randomReq as never);
      const randomBody = await randomRes.json();

      expect(poolBody.matchingItems).toBe(randomBody.stats.totalMatches);
      expect(sent.filter((r) => r.url.pathname === '/library/collections/col-1/children')).toHaveLength(2);
    });
  });
});
