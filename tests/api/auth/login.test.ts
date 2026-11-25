import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  seedPartialSettings,
  seedTestUser,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import {
  fakeIntegrations,
  plexResources,
  PLEX_TV,
  routes,
  TEST_PLEX_SERVER,
  type SentRequest,
} from '../../helpers/fake-integrations';

import { GET as statusGet } from '@/app/api/settings/status/route';
import { POST as setupPost } from '@/app/api/settings/setup/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { POST as testPlexPost } from '@/app/api/settings/test-plex/route';
import { getOrCreateSettings } from '@/lib/models/Settings';

describe('Auth and setup API routes', () => {
  let sent: SentRequest[];

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    ({ sent } = fakeIntegrations(
      routes({
        [`${PLEX_TV}/api/v2/user`]: () => Response.json({ id: 1, username: 'testuser', email: 'test@example.com' }),
        [`${PLEX_TV}/api/v2/resources`]: () =>
          plexResources([{ name: 'Home', clientIdentifier: 'machine-1', owned: true, uri: TEST_PLEX_SERVER }]),
      })
    ));
  });

  describe('GET /api/settings/status', () => {
    it('returns setupComplete false for fresh install', async () => {
      const res = await statusGet();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.setupComplete).toBe(false);
    });

    it('returns configured status after setup', async () => {
      await seedConfiguredSettings();
      const res = await statusGet();
      const body = await res.json();
      expect(body.setupComplete).toBe(true);
      expect(body.hasPlexToken).toBe(true);
      expect(body.hasPlexServer).toBe(true);
    });

    it('returns setupComplete false when DB flag is set but Plex token is missing', async () => {
      await seedPartialSettings();
      const res = await statusGet();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.setupComplete).toBe(false);
      expect(body.hasPlexToken).toBe(false);
      expect(body.hasPlexServer).toBe(true);
    });

    it('returns setupComplete true for OAuth-style setup with admin user token only', async () => {
      const settings = await getOrCreateSettings();
      settings.plexToken = undefined;
      settings.plexServerUrl = 'http://192.168.1.10:32400';
      settings.plexMachineId = 'machine-1';
      settings.setupComplete = true;
      await settings.save();

      const adminUser = await seedTestUser({ isAdmin: true, plexUserId: 'oauth-admin-1' });
      settings.adminUserId = adminUser._id;
      await settings.save();

      const res = await statusGet();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.setupComplete).toBe(true);
      expect(body.hasPlexToken).toBe(true);
      expect(body.hasPlexServer).toBe(true);
    });
  });

  describe('POST /api/settings/setup', () => {
    it('directs fresh installs to Plex OAuth', async () => {
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {});
      const res = await setupPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.useOAuth).toBe(true);
      expect(body.error).toMatch(/signing in with Plex/i);
    });

    it('rejects token-based setup on fresh install even with a valid token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {
        plexToken: 'valid-token',
        plexServerUrl: 'http://192.168.1.10:32400',
      });
      const res = await setupPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.useOAuth).toBe(true);
    });

    it('allows admin to update TMDB key after setup is complete', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();

      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {
        tmdbApiKey: 'new-tmdb-key-abcdefgh',
      });
      const res = await setupPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const settings = await getOrCreateSettings();
      expect(settings.getDecryptedTmdbKey()).toBe('new-tmdb-key-abcdefgh');
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 410 directing clients to Plex OAuth', async () => {
      const res = await loginPost(new Request('http://localhost/api/auth/login', { method: 'POST' }));
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.useOAuth).toBe(true);
      expect(body.error).toMatch(/Plex OAuth/i);
    });

    it('returns 410 even when app is configured', async () => {
      await seedConfiguredSettings();
      const res = await loginPost(new Request('http://localhost/api/auth/login', { method: 'POST' }));
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.useOAuth).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without session', async () => {
      await seedConfiguredSettings();
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns user when session valid', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();
      const res = await meGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.username).toBe('testuser');
    });
  });

  describe('POST /api/settings/test-plex', () => {
    it('requires Plex token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {});
      const res = await testPlexPost(req as never);
      expect(res.status).toBe(400);
    });

    it('rejects invalid server URL', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {
        plexToken: 'token',
        plexServerUrl: 'http://169.254.169.254:32400',
      });
      const res = await testPlexPost(req as never);
      expect(res.status).toBe(400);
    });

    it('returns valid for good token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {
        plexToken: 'valid-token',
      });
      const res = await testPlexPost(req as never);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.user.username).toBe('testuser');
      expect(body.servers).toEqual([{ name: 'Home', uri: TEST_PLEX_SERVER }]);
      expect(sent.map((r) => [r.url.pathname, r.headers.get('X-Plex-Token')])).toEqual([
        ['/api/v2/user', 'valid-token'],
        ['/api/v2/resources', 'valid-token'],
      ]);
    });
  });
});
