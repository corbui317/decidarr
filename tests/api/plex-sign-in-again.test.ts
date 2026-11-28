import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { seedConfiguredSettings, authenticateTestSession, clearTestCookies, createJsonRequest } from '../helpers/auth';
import { SAMPLE_LIBRARY_ITEMS } from '../fixtures/library-items';
import { fakeIntegrations, plexLibraryItems, plexSections, TEST_PLEX_SERVER } from '../helpers/fake-integrations';
import { getOrCreateSettings } from '@/lib/models/Settings';

import { GET as collectionsGet } from '@/app/api/library/collections/route';
import { POST as randomPost } from '@/app/api/selection/random/route';
import { POST as poolCountPost } from '@/app/api/selection/pool-count/route';
import { POST as fetchMachineIdPost } from '@/app/api/settings/fetch-machine-id/route';

/**
 * A Plex server that lists the user's libraries and their items but answers every other request
 * with `status`: a 401 is what a server sends once the user's access token stops working.
 */
function fakeServerAnswering(status: number) {
  return fakeIntegrations((request) => {
    if (request.url.href === `${TEST_PLEX_SERVER}/library/sections`) {
      return plexSections([{ id: 'lib-1', title: 'Movies', type: 'movie' }]);
    }
    if (request.url.href === `${TEST_PLEX_SERVER}/library/sections/lib-1/all`) {
      return plexLibraryItems(SAMPLE_LIBRARY_ITEMS);
    }
    return new Response('refused', { status });
  });
}

const collectionFilter = { libraryIds: ['lib-1'], mediaType: 'movie', filters: { collections: ['col-1'] } };

async function expectSignInAgain(res: Response) {
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ code: 'PLEX_SIGN_IN_REQUIRED', error: expect.stringMatching(/sign in again/i) });
}

describe('A Plex server refusing the user\'s access token', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    await authenticateTestSession();
  });

  it('asks the user to sign in again when listing collections', async () => {
    fakeServerAnswering(401);
    await expectSignInAgain(await collectionsGet(new NextRequest('http://localhost/api/library/collections?libraryIds=lib-1')));
  });

  it('asks the user to sign in again on a pool count with a collection filter', async () => {
    fakeServerAnswering(401);
    await expectSignInAgain(
      await poolCountPost(createJsonRequest('http://localhost/api/selection/pool-count', 'POST', collectionFilter) as never)
    );
  });

  it('asks the user to sign in again on a spin with a collection filter', async () => {
    fakeServerAnswering(401);
    await expectSignInAgain(
      await randomPost(createJsonRequest('http://localhost/api/selection/random', 'POST', collectionFilter) as never)
    );
  });

  it("asks the Admin to sign in again when reading the server's identity", async () => {
    const settings = await getOrCreateSettings();
    settings.plexMachineId = undefined;
    await settings.save();
    fakeServerAnswering(401);
    await expectSignInAgain(
      await fetchMachineIdPost(createJsonRequest('http://localhost/api/settings/fetch-machine-id', 'POST') as never)
    );
  });

  describe('other Plex server failures behave as before', () => {
    it('lists no collections for a library the server fails on', async () => {
      fakeServerAnswering(500);
      const res = await collectionsGet(new NextRequest('http://localhost/api/library/collections?libraryIds=lib-1'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ collections: [] });
    });

    it('counts an empty pool for a collection the server fails on', async () => {
      fakeServerAnswering(500);
      const res = await poolCountPost(
        createJsonRequest('http://localhost/api/selection/pool-count', 'POST', collectionFilter) as never
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ matchingItems: 0, emptyReason: 'No items found in the selected collections' });
    });
  });
});
