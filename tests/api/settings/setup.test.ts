import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';
import mongoose from 'mongoose';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { GET as settingsGet, PUT as settingsPut } from '@/app/api/settings/route';

describe('Settings API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings({ tmdbApiKey: 'tmdb12345678abcdef' });
    await authenticateTestSession();
  });

  describe('GET /api/settings', () => {
    it('returns masked secrets and no Plex token at all', async () => {
      const res = await settingsGet(createJsonRequest('http://localhost/api/settings', 'GET'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plex).toEqual({ serverUrl: 'http://192.168.1.10:32400', username: 'testuser', machineId: 'machine-1' });
      expect(body.tmdb.keyMasked).toContain('****');
      expect(body.tmdb.keyMasked).not.toBe('tmdb12345678abcdef');
    });

    it('returns 401 without session', async () => {
      clearTestCookies();
      const res = await settingsGet(createJsonRequest('http://localhost/api/settings', 'GET'));
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/settings', () => {
    it('never stores a settings-level Plex token', async () => {
      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        plex: { token: 'pasted-plex-token' },
      });
      const putRes = await settingsPut(putReq as never);
      expect(putRes.status).toBe(200);

      const raw = await mongoose.connection.collection('settings').findOne({ _id: 'app-settings' as never });
      expect(raw).not.toHaveProperty('plexToken');
    });

    it('rejects invalid Plex server URL', async () => {
      const putReq = createJsonRequest('http://localhost/api/settings', 'PUT', {
        plex: { serverUrl: 'http://169.254.169.254:32400' },
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
