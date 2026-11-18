import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
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

    it('persists Tautulli URL and enabled flag when saving with existing API key', async () => {
      const settings = await getOrCreateSettings();
      settings.tautulliApiKey = 'existing-tautulli-key-abcdefgh';
      settings.tautulliEnabled = false;
      settings.tautulliUrl = undefined;
      await settings.save();

      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        tautulli: {
          url: 'http://192.168.1.100:8181',
          enabled: true,
        },
      });
      const putRes = await settingsPut(putReq as never);
      expect(putRes.status).toBe(200);

      const updated = await getOrCreateSettings();
      expect(updated.tautulliUrl).toBe('http://192.168.1.100:8181');
      expect(updated.tautulliEnabled).toBe(true);
      expect(updated.getDecryptedTautulliKey()).toBeTruthy();
    });

    it('rejects enabling Tautulli without URL', async () => {
      const settings = await getOrCreateSettings();
      settings.tautulliApiKey = 'existing-tautulli-key-abcdefgh';
      settings.tautulliUrl = undefined;
      await settings.save();

      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        tautulli: { enabled: true },
      });
      const putRes = await settingsPut(putReq as never);
      expect(putRes.status).toBe(400);
      const body = await putRes.json();
      expect(body.error).toMatch(/URL is required/i);
    });
  });
});
