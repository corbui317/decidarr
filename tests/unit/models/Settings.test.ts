import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import CryptoJS from 'crypto-js';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { decryptLegacy } from '@/lib/secrets';

describe('Settings model', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('creates singleton settings document', async () => {
    const settings = await getOrCreateSettings();
    expect(settings._id).toBe('app-settings');
    expect(settings.setupComplete).toBe(false);
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

  describe('legacy CryptoJS values', () => {
    it('decrypts a CryptoJS passphrase ciphertext', () => {
      const legacy = CryptoJS.AES.encrypt('legacy-value', 'master-key').toString();
      expect(decryptLegacy(legacy, 'master-key')).toBe('legacy-value');
    });

    it('rejects a value that is not CryptoJS passphrase ciphertext, every time', () => {
      // Without the "Salted__" header CryptoJS derives the key with a random salt,
      // so garbage decrypts to a random string often enough to pass as a value.
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        for (let i = 0; i < 1000; i++) {
          expect(() => decryptLegacy('also-corrupted-!!!', 'master-key')).toThrow('Failed to decrypt value');
        }
      } finally {
        quiet.mockRestore();
      }
    });
  });
});
