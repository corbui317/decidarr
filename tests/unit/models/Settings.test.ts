import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import { getOrCreateSettings } from '@/lib/models/Settings';

describe('Settings model', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('creates singleton settings document', async () => {
    const settings = await getOrCreateSettings();
    expect(settings._id).toBe('app-settings');
    expect(settings.setupComplete).toBe(false);
  });

  it('round-trips encrypted Plex token', async () => {
    const settings = await getOrCreateSettings();
    settings.plexToken = 'my-secret-plex-token-value';
    await settings.save();

    const reloaded = await getOrCreateSettings();
    expect(reloaded.getDecryptedPlexToken()).toBe('my-secret-plex-token-value');
  });

  it('round-trips encrypted TMDB key', async () => {
    const settings = await getOrCreateSettings();
    settings.tmdbApiKey = 'tmdb-api-key-12345';
    await settings.save();

    const reloaded = await getOrCreateSettings();
    expect(reloaded.getDecryptedTmdbKey()).toBe('tmdb-api-key-12345');
  });

  it('clamps spin history retention on save via preferences helper', async () => {
    const settings = await getOrCreateSettings();
    settings.spinHistoryPreferences = {
      enabled: true,
      retentionLimit: 50,
      storeFilterSnapshot: true,
    };
    await settings.save();

    expect(settings.spinHistoryPreferences.retentionLimit).toBeGreaterThanOrEqual(1);
    expect(settings.spinHistoryPreferences.retentionLimit).toBeLessThanOrEqual(500);
  });
});
