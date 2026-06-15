import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/settings/route';

describe('Settings API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings({
      plexToken: 'test-plex-token-abcdefghijklmnop',
      tmdbApiKey: 'tmdb12345678abcdef',
    });
    await authenticateTestSession();
  });

  describe('GET /api/settings', () => {
    it('returns masked secrets', async () => {
      const res = await settingsGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plex.hasToken).toBe(true);
      expect(body.plex.tokenMasked).toContain('****');
      expect(body.plex.tokenMasked).not.toBe('abcdefghijklmnop');
    });

    it('returns 401 without session', async () => {
      clearTestCookies();
      const res = await settingsGet();
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/settings', () => {
    it('does not overwrite token when masked value sent', async () => {
      const getRes = await settingsGet();
      const current = await getRes.json();

      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        plex: { token: current.plex.tokenMasked },
      });
      const putRes = await settingsPut(putReq as never);
      expect(putRes.status).toBe(200);

      const afterRes = await settingsGet();
      const after = await afterRes.json();
      expect(after.plex.hasToken).toBe(true);
    });

    it('rejects invalid Plex server URL', async () => {
      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        plex: { serverUrl: 'http://127.0.0.1:32400' },
      });
      const putRes = await settingsPut(putReq as never);
      expect(putRes.status).toBe(400);
    });
  });
});
