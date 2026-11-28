import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import { authenticateTestSession, createJsonRequest, seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { fakeIntegrations, TMDB } from '../helpers/fake-integrations';

import { POST as testTmdbPost } from '@/app/api/settings/test-tmdb/route';

function testTmdbRequest(apiKey: string) {
  return createJsonRequest('http://localhost/api/settings/test-tmdb', 'POST', { apiKey }) as never;
}

describe('POST /api/settings/test-tmdb (spec #18 story 38: no open TMDb key oracle)', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedConfiguredSettings();
    fakeIntegrations((request) => {
      if (request.url.origin + request.url.pathname === `${TMDB}/configuration`) {
        return Response.json({ images: { secure_base_url: 'https://image.tmdb.org/t/p/' } });
      }
      throw new Error(`unexpected request to ${request.url}`);
    });
  });

  it('rejects an unauthenticated call', async () => {
    const response = await testTmdbPost(testTmdbRequest('some-tmdb-key'));

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('UNAUTHENTICATED');
  });

  it('rejects a Friend call', async () => {
    const friend = await seedTestUser({ plexUserId: 'friend-1', isAdmin: false });
    await authenticateTestSession({ user: friend });

    const response = await testTmdbPost(testTmdbRequest('some-tmdb-key'));

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('FORBIDDEN');
  });

  it('allows an authenticated Admin call', async () => {
    const admin = await seedTestUser({ plexUserId: 'admin-1', isAdmin: true });
    await authenticateTestSession({ user: admin });

    const response = await testTmdbPost(testTmdbRequest('some-tmdb-key'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ valid: true });
  });
});
