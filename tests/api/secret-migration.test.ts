import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import { getOrCreateSettings, Settings } from '@/lib/models/Settings';
import { runMigrations, resetMigrationStateForTests } from '@/lib/migrate';
import { connectDB } from '@/lib/db';
import CryptoJS from 'crypto-js';

describe('Secret migration and encryption', () => {
  beforeEach(async () => {
    await clearDatabase();
    resetMigrationStateForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Fresh install with DECIDARR_SECRET', () => {
    it('does not crash when creating settings with DECIDARR_SECRET set', async () => {
      vi.stubEnv('DECIDARR_SECRET', 'test-secret-key-12345');
      vi.stubEnv('NODE_ENV', 'development');

      await connectDB();

      // This previously crashed 28 of 40 times due to migration attempting
      // to decrypt with wrong key
      const settings = await getOrCreateSettings();

      expect(settings).toBeDefined();
      expect(settings.jwtSecret).toBeDefined();
      expect(settings.encryptionKey).toBeDefined();

      // Should be able to decrypt the secrets
      const jwtSecret = settings.getJwtSecret();
      const encryptionKey = settings.getEncryptionKey();

      expect(jwtSecret).toBeTruthy();
      expect(encryptionKey).toBeTruthy();
    });

    it('survives multiple fresh install attempts with DECIDARR_SECRET', async () => {
      vi.stubEnv('DECIDARR_SECRET', 'test-secret-key-12345');
      vi.stubEnv('NODE_ENV', 'development');

      await connectDB();

      // Run 40 times to cover the intermittent crash
      for (let i = 0; i < 40; i++) {
        await clearDatabase();
        resetMigrationStateForTests();

        const settings = await getOrCreateSettings();
        expect(settings.getJwtSecret()).toBeTruthy();
        expect(settings.getEncryptionKey()).toBeTruthy();
      }
    });
  });

  describe('Production startup requirements', () => {
    it('throws clear error when DECIDARR_SECRET is missing in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DECIDARR_SECRET', '');

      await connectDB();
      await clearDatabase();

      // In production without DECIDARR_SECRET, even creating settings should fail
      // with a clear error message
      await expect(getOrCreateSettings()).rejects.toThrow(/DECIDARR_SECRET is required in production/);
    });
  });

  describe('Migration idempotence', () => {
    it('does not re-encrypt secrets on restart', async () => {
      vi.stubEnv('DECIDARR_SECRET', 'test-secret-key-12345');
      vi.stubEnv('NODE_ENV', 'development');

      await connectDB();

      // First run - create settings
      const settings1 = await getOrCreateSettings();
      await runMigrations();
      const encrypted1 = settings1.jwtSecret;

      // Simulate restart - migration runs again
      resetMigrationStateForTests();
      await runMigrations();

      // Re-fetch settings
      const settings2 = await getOrCreateSettings();
      const encrypted2 = settings2.jwtSecret;

      // Encrypted values should be identical (not re-encrypted)
      expect(encrypted2).toBe(encrypted1);

      // And still decrypt correctly
      expect(settings2.getJwtSecret()).toBeTruthy();
    });
  });

  describe('Legacy to AES-256-GCM migration', () => {
    it('migrates legacy CryptoJS encrypted values to AES-256-GCM', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/decidarr');

      await connectDB();

      // Create settings without DECIDARR_SECRET (legacy mode)
      const settings1 = await getOrCreateSettings();
      const originalJwt = settings1.getJwtSecret();
      const originalKey = settings1.getEncryptionKey();

      // Verify legacy format (no v2: prefix)
      expect(settings1.jwtSecret).not.toMatch(/^v2:/);
      expect(settings1.encryptionKey).not.toMatch(/^v2:/);
      expect(settings1.secretsMigrationVersion).toBeUndefined();

      // Now set DECIDARR_SECRET and run migration
      vi.stubEnv('DECIDARR_SECRET', 'migration-test-secret');
      resetMigrationStateForTests();
      await runMigrations();

      // Re-fetch settings
      const settings2 = await getOrCreateSettings();

      // Verify migration marker is set
      expect(settings2.secretsMigrationVersion).toBe(2);

      // Verify new format (v2: prefix)
      expect(settings2.jwtSecret).toMatch(/^v2:/);
      expect(settings2.encryptionKey).toMatch(/^v2:/);

      // Verify values still decrypt to same plaintext
      expect(settings2.getJwtSecret()).toBe(originalJwt);
      expect(settings2.getEncryptionKey()).toBe(originalKey);
    });

    it('preserves integration credentials after master key migration', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/decidarr');

      await connectDB();

      // Create settings with integration credentials (legacy mode)
      const settings1 = await getOrCreateSettings();
      settings1.plexToken = 'test-plex-token-abc123';
      settings1.tmdbApiKey = 'test-tmdb-key-xyz789';
      settings1.tautulliApiKey = 'test-tautulli-key-456';
      settings1.overseerrApiKey = 'test-overseerr-key-789';
      await settings1.save();

      // Get decrypted values before migration
      const decryptedPlex = settings1.getDecryptedPlexToken();
      const decryptedTmdb = settings1.getDecryptedTmdbKey();
      const decryptedTautulli = settings1.getDecryptedTautulliKey();
      const decryptedOverseerr = settings1.getDecryptedOverseerrKey();

      // Now set DECIDARR_SECRET and run migration
      // This migrates the jwtSecret and encryptionKey to v2 format
      vi.stubEnv('DECIDARR_SECRET', 'migration-test-secret');
      resetMigrationStateForTests();
      await runMigrations();

      // Re-fetch settings
      const settings2 = await getOrCreateSettings();

      // Integration credentials should still decrypt correctly
      // even though they're still in CryptoJS format
      // (they're encrypted with the encryptionKey, which can still be decrypted)
      expect(settings2.getDecryptedPlexToken()).toBe(decryptedPlex);
      expect(settings2.getDecryptedTmdbKey()).toBe(decryptedTmdb);
      expect(settings2.getDecryptedTautulliKey()).toBe(decryptedTautulli);
      expect(settings2.getDecryptedOverseerrKey()).toBe(decryptedOverseerr);
    });

    it('handles decrypt failures gracefully with logging', async () => {
      vi.stubEnv('DECIDARR_SECRET', 'test-secret');
      vi.stubEnv('NODE_ENV', 'development');

      await connectDB();

      // Create settings manually with a corrupted encrypted value, bypassing the pre-save hook
      await Settings.collection.insertOne({
        _id: 'app-settings' as any,
        jwtSecret: 'corrupted-invalid-base64-!!!',
        encryptionKey: 'also-corrupted-!!!',
        setupComplete: false,
      });

      // Attempting to get settings and decrypt should throw a clear error
      const settings = await Settings.findById('app-settings');
      expect(settings).toBeDefined();

      // Decryption should fail with a recoverable error
      expect(() => settings!.getJwtSecret()).toThrow(/Failed to decrypt/);
      expect(() => settings!.getEncryptionKey()).toThrow(/Failed to decrypt/);
    });
  });
});
