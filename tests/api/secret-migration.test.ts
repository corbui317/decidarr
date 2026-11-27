import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, setTestCookie } from '../helpers/cookies';
import { authenticateTestSession, createJsonRequest, createModernSessionToken, seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import {
  seedLegacyInstall,
  seedV2Install,
  LEGACY_PLAINTEXT,
  LEGACY_ADMIN_PLEX_USER_ID,
  LEGACY_MACHINE_ID,
  type StoredSettings,
} from '../helpers/legacy-install-seed';
import { defaultServerToken, fakeIntegrations, fakePlex } from '../helpers/fake-integrations';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { findCredentialsNeedingReentry, runMigrations, resetMigrationStateForTests } from '@/lib/migrate';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  getLegacyMasterKey,
  isCurrentCiphertext,
  type SecretLocation,
} from '@/lib/secrets';
import { GET as statusGet } from '@/app/api/settings/status/route';
import { GET as settingsGet } from '@/app/api/settings/route';
import { GET as meGet } from '@/app/api/auth/me/route';

const SECRET = 'stored-secrets-test-0123456789abcdef';
const TMDB: SecretLocation = { recordType: 'settings', recordId: 'app-settings', field: 'tmdbApiKey' };

function simulateRestart(): void {
  forgetConnectionForTests();
  resetMigrationStateForTests();
}

function settingsCollection() {
  return mongoose.connection.db!.collection<StoredSettings>('settings');
}

async function rawSettings(): Promise<StoredSettings> {
  return (await settingsCollection().findOne({ _id: 'app-settings' }))!;
}

describe('Stored secrets', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    resetMigrationStateForTests();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DECIDARR_SECRET', SECRET);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('v3 format', () => {
    it('stores settings secrets as v3 ciphertext and reads them back', async () => {
      const settings = await getOrCreateSettings();
      settings.tmdbApiKey = 'tmdb-key-plain';
      await settings.save();

      const raw = await rawSettings();
      expect(isCurrentCiphertext(raw.tmdbApiKey!)).toBe(true);
      expect(raw.tmdbApiKey).not.toContain('tmdb-key-plain');
      expect((await getOrCreateSettings()).getDecryptedTmdbKey()).toBe('tmdb-key-plain');
    });

    it('uses a 16-byte tag and rejects a truncated one', () => {
      const stored = encryptSecret('value', TMDB);
      const [, iv, tag, ciphertext] = stored.split(':');
      expect(Buffer.from(tag, 'base64url')).toHaveLength(16);

      const shortTag = Buffer.from(tag, 'base64url').subarray(0, 12).toString('base64url');
      expect(() => decryptSecret(`v3:${iv}:${shortTag}:${ciphertext}`, TMDB)).toThrow(/cannot be decrypted/);
    });

    it('derives a separate key per purpose from DECIDARR_SECRET', () => {
      const keys = (['stored-secrets', 'web-session', 'mobile-access-token'] as const).map((p) =>
        deriveKey(p).toString('hex')
      );
      expect(new Set(keys).size).toBe(3);

      vi.stubEnv('DECIDARR_SECRET', `${SECRET}-other`);
      expect(deriveKey('stored-secrets').toString('hex')).not.toBe(keys[0]);
    });

    it('refuses to derive keys in production without DECIDARR_SECRET', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DECIDARR_SECRET', '');
      expect(() => deriveKey('stored-secrets')).toThrow(/DECIDARR_SECRET is required in production/);
    });
  });

  describe('a ciphertext copied onto another record or field', () => {
    it('fails to decrypt on another settings field, and the Admin is told', async () => {
      await seedConfiguredSettings({ tmdbApiKey: 'tmdb-key-plain' });
      await authenticateTestSession();
      const tmdbCiphertext = (await rawSettings()).tmdbApiKey!;
      await settingsCollection().updateOne({ _id: 'app-settings' }, { $set: { tautulliApiKey: tmdbCiphertext } });

      const res = await settingsGet(createJsonRequest('http://localhost/api/settings', 'GET'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tmdb.hasKey).toBe(true);
      expect(body.tautulli.hasKey).toBe(false);
      expect(body.credentialsNeedingReentry).toEqual(['Tautulli API key']);
      expect((await rawSettings()).tautulliApiKey).toBe(tmdbCiphertext);
    });

    it('fails to decrypt on another user, so that user is signed out and reported', async () => {
      await seedConfiguredSettings();
      const admin = await seedTestUser({ plexUserId: 'admin-1', plexUsername: 'admin' });
      const friend = await seedTestUser({ plexUserId: 'friend-1', plexUsername: 'friend', isAdmin: false });
      await User.updateOne({ _id: friend._id }, { $set: { plexServerToken: admin.plexServerToken } });

      setTestCookie('decidarr_session', await createModernSessionToken(friend));
      expect((await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'))).status).toBe(401);

      setTestCookie('decidarr_session', await createModernSessionToken(admin));
      expect((await meGet(createJsonRequest('http://localhost/api/auth/me', 'GET'))).status).toBe(200);
      expect(await findCredentialsNeedingReentry()).toEqual(['Plex sign-in for friend']);
      expect((await User.findById(friend._id))?.plexServerToken).toBe(admin.plexServerToken);
    });
  });

  describe('migration', () => {
    it('upgrades an install that already used DECIDARR_SECRET (v2) to v3 without loss', async () => {
      await connectDB();
      const seed = await seedV2Install(mongoose.connection.db!, SECRET);
      const legacyWrappedKey = (await rawSettings()).encryptionKey;
      fakeIntegrations(fakePlex({ serverUri: 'http://192.168.1.10:32400', machineId: LEGACY_MACHINE_ID }));

      simulateRestart();
      expect((await statusGet(createJsonRequest('http://localhost/api/settings/status', 'GET'))).status).toBe(200);

      const raw = await rawSettings();
      expect(raw.plexToken).toBeUndefined();
      expect(isCurrentCiphertext(raw.tmdbApiKey!)).toBe(true);
      expect(raw.encryptionKey).toBe(legacyWrappedKey);
      const settings = await getOrCreateSettings();
      expect(settings.getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
      const admin = await User.findById(seed.adminUserId);
      expect(admin!.plexToken).toBeUndefined();
      expect(isCurrentCiphertext(admin!.plexAccountToken!)).toBe(true);
      expect(admin!.getAccountToken()).toBe(LEGACY_PLAINTEXT.plexToken);
      expect(admin!.getServerToken()).toBe(defaultServerToken(LEGACY_MACHINE_ID));
      expect(await findCredentialsNeedingReentry()).toEqual([]);
    });

    it('leaves v3 values untouched on later restarts', async () => {
      await connectDB();
      await seedLegacyInstall(mongoose.connection.db!, getLegacyMasterKey());
      simulateRestart();
      await connectDB();
      const first = await rawSettings();
      const firstUser = await User.findOne({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID });

      simulateRestart();
      await connectDB();
      const second = await rawSettings();
      expect(second.tmdbApiKey).toBe(first.tmdbApiKey);
      expect(second.plexToken).toBe(first.plexToken);
      expect((await User.findOne({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID }))?.plexToken).toBe(
        firstUser?.plexToken
      );
    });

    it('keeps a value it cannot read exactly as stored and reports it', async () => {
      await settingsCollection().insertOne({
        _id: 'app-settings',
        encryptionKey: 'also-corrupted-!!!',
        tmdbApiKey: 'U2FsdGVkX1-not-really-cryptojs',
        overseerrApiKey: 'v2:corrupted',
        setupComplete: false,
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await runMigrations();

      const raw = await rawSettings();
      expect(raw.tmdbApiKey).toBe('U2FsdGVkX1-not-really-cryptojs');
      expect(raw.overseerrApiKey).toBe('v2:corrupted');
      expect(raw.encryptionKey).toBe('also-corrupted-!!!');
      expect(await findCredentialsNeedingReentry()).toEqual(['TMDB API key', 'Overseerr API key']);
      const logged = warn.mock.calls.map((args) => String(args[0])).join('\n');
      expect(logged).toContain('TMDB API key');
      expect(logged).not.toContain('U2FsdGVkX1-not-really-cryptojs');
    });

    it('runs exactly once for concurrent first requests', async () => {
      vi.stubEnv('DECIDARR_SECRET', '');
      await connectDB();
      await seedLegacyInstall(mongoose.connection.db!, getLegacyMasterKey());
      vi.stubEnv('DECIDARR_SECRET', SECRET);
      simulateRestart();
      const info = vi.spyOn(console, 'log').mockImplementation(() => {});

      const responses = await Promise.all([
        statusGet(createJsonRequest('http://localhost/api/settings/status', 'GET')),
        runMigrations(),
        statusGet(createJsonRequest('http://localhost/api/settings/status', 'GET')),
        runMigrations(),
        runMigrations(),
      ]);

      for (const res of responses) {
        if (res) expect(res.status).toBe(200);
      }
      const upgrades = info.mock.calls.filter((args) =>
        String(args[0]).includes('Upgraded stored secrets to the v3 format')
      );
      expect(upgrades).toHaveLength(1);
      expect((await getOrCreateSettings()).getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
    });
  });
});
