import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import { LibraryCache } from '@/lib/models/LibraryCache';
import {
  fakeIntegrations,
  plexMetadata,
  plexSections,
  routes,
  TEST_PLEX_SERVER,
} from '../helpers/fake-integrations';

import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';

const SAMPLE_TITLES = SAMPLE_LIBRARY_ITEMS.map((item) => item.title);

/** The seeded Plex server: one movie library holding the sample items, and a two-item collection. */
function fakePlexServer() {
  return fakeIntegrations(
    routes({
      [`${TEST_PLEX_SERVER}/library/sections`]: () => plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]),
      ...Object.fromEntries(
        SAMPLE_LIBRARY_ITEMS.map(({ plexId, title, year }) => [
          `${TEST_PLEX_SERVER}/library/metadata/${plexId}`,
          () => plexMetadata([{ ratingKey: plexId, title, year, type: 'movie' }]),
        ])
      ),
      [`${TEST_PLEX_SERVER}/library/collections/101/children`]: () =>
        plexMetadata([
          { ratingKey: '1', title: 'Inception' },
          { ratingKey: '2', title: 'The Matrix' },
        ]),
    })
  );
}

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
  let sent: ReturnType<typeof fakePlexServer>['sent'];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    await authenticateTestSession();
    ({ sent } = fakePlexServer());
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
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'mediaType' })])
      );
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
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'filters.collections' })])
      );
    });

    it('rejects a malformed collection key before it reaches Plex (spec #18 story 39)', async () => {
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
        mediaType: 'movie',
        filters: { collections: ['../../etc/passwd'] },
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'filters.collections.0' })])
      );
      expect(sent.find((r) => r.url.pathname.includes('/library/collections/'))).toBeUndefined();
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
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'mediaType' })])
      );
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
      expect(SAMPLE_TITLES).toContain(body.selection.title);
    });
  });
});
