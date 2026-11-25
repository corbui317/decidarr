import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  seedTestUser,
  createModernSessionToken,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { setTestCookie } from '../helpers/cookies';
import { WatchedItem } from '@/lib/models/WatchedItem';

const plexMock = {
  getLibrarySections: vi.fn(),
};

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

import { GET as collectionsGet } from '@/app/api/library/collections/route';
import { GET as filterOptionsGet } from '@/app/api/library/filter-options/route';
import { GET as genresGet } from '@/app/api/library/genres/route';
import { GET as yearsGet } from '@/app/api/library/years/route';
import { GET as libraryItemsGet } from '@/app/api/library/[id]/items/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';
import { GET as preferencesGet } from '@/app/api/users/me/preferences/route';
import { GET as watchedItemGet, DELETE as watchedItemDelete } from '@/app/api/watched/[plexId]/route';

/**
 * Covers the 401/403/invalid-input acceptance criterion for the batch #21 routes
 * that had no dedicated auth or validation coverage before the migration.
 */
describe('Batch #21 route auth and validation', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    plexMock.getLibrarySections.mockResolvedValue([
      { id: 'lib-1', title: 'Movies', type: 'movie' },
    ]);
  });

  describe('401 without a session', () => {
    it('GET /api/library/collections', async () => {
      await seedConfiguredSettings();
      const res = await collectionsGet(new NextRequest('http://localhost/api/library/collections'));
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('UNAUTHENTICATED');
    });

    it('GET /api/library/filter-options', async () => {
      await seedConfiguredSettings();
      const res = await filterOptionsGet(new NextRequest('http://localhost/api/library/filter-options'));
      expect(res.status).toBe(401);
    });

    it('GET /api/library/genres', async () => {
      await seedConfiguredSettings();
      const res = await genresGet(new NextRequest('http://localhost/api/library/genres'));
      expect(res.status).toBe(401);
    });

    it('GET /api/library/years', async () => {
      await seedConfiguredSettings();
      const res = await yearsGet(new NextRequest('http://localhost/api/library/years'));
      expect(res.status).toBe(401);
    });

    it('GET /api/library/[id]/items', async () => {
      await seedConfiguredSettings();
      const res = await libraryItemsGet(new NextRequest('http://localhost/api/library/lib-1/items'), {
        params: Promise.resolve({ id: 'lib-1' }),
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/selection/pool-count', async () => {
      await seedConfiguredSettings();
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: ['lib-1'],
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(401);
    });

    it('GET /api/users/me/preferences', async () => {
      await seedConfiguredSettings();
      const res = await preferencesGet(new NextRequest('http://localhost/api/users/me/preferences'));
      expect(res.status).toBe(401);
    });

    it('GET /api/watched/[plexId]', async () => {
      await seedConfiguredSettings();
      const res = await watchedItemGet(new NextRequest('http://localhost/api/watched/plex-1'), {
        params: Promise.resolve({ plexId: 'plex-1' }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('403 for a library outside the caller\'s Plex access', () => {
    it('GET /api/library/[id]/items refuses an inaccessible library', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();
      // The caller's Plex sections do not include lib-restricted.
      const res = await libraryItemsGet(
        new NextRequest('http://localhost/api/library/lib-restricted/items'),
        { params: Promise.resolve({ id: 'lib-restricted' }) }
      );
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN');
    });
  });

  describe('403 for a non-admin on watched/[plexId] DELETE', () => {
    it('rejects a non-admin friend', async () => {
      await seedConfiguredSettings();
      const friend = await seedTestUser({
        plexUserId: 'plex-friend-delete',
        plexUsername: 'frienddelete',
        isAdmin: false,
        isApproved: true,
      });
      const token = await createModernSessionToken(friend);
      setTestCookie('decidarr_session', token);

      await WatchedItem.create({
        userId: friend._id,
        plexId: 'plex-1',
        mediaType: 'movie',
        title: 'Some Movie',
        watchedAt: new Date(),
        markedManually: true,
        source: 'manual',
      });

      const res = await watchedItemDelete(
        createJsonRequest('http://localhost/api/watched/plex-1', 'DELETE') as never,
        { params: Promise.resolve({ plexId: 'plex-1' }) }
      );
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('FORBIDDEN');

      const stillThere = await WatchedItem.findOne({ userId: friend._id, plexId: 'plex-1' });
      expect(stillThere).not.toBeNull();
    });
  });

  describe('invalid input', () => {
    it('POST /api/selection/pool-count rejects a non-array libraryIds', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();
      const req = createJsonRequest('http://localhost/api/selection/pool-count', 'POST', {
        libraryIds: 'not-an-array',
      });
      const res = await poolCountPost(req as never);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    });

    it('GET /api/library/[id]/items rejects a missing id param', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();
      const res = await libraryItemsGet(new NextRequest('http://localhost/api/library//items'), {
        params: Promise.resolve({ id: '' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    });
  });
});
