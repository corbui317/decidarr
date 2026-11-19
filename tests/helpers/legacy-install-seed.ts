/**
 * Seeds a pre-DECIDARR_SECRET install exactly as it sits on disk before the
 * secret migration: CryptoJS ciphertext with no version prefix, the master key
 * derived from MONGODB_URI, and no `secretsMigrationVersion`.
 *
 * Shared by the Vitest upgrade test and the guarded E2E seed route, so both
 * exercise the same legacy data. Production builds stub this module out
 * (see next.config.js).
 */
import CryptoJS from 'crypto-js';
import type mongoose from 'mongoose';
import { E2E_MOCK_OAUTH_USER } from './plex-oauth-mocks';

export const LEGACY_PLAINTEXT = {
  plexToken: 'test-plex-token-legacy',
  tmdbApiKey: 'test-tmdb-key-legacy',
} as const;

/** The legacy admin signs in with the identity the mock Plex OAuth flow returns. */
export const LEGACY_ADMIN_PLEX_USER_ID = E2E_MOCK_OAUTH_USER.id;
export const LEGACY_MACHINE_ID = 'legacy-machine-1';
export const LEGACY_LIBRARY_ID = '1';

/** The settings document as stored, for tests that read it without the model. */
export interface StoredSettings {
  _id: string;
  jwtSecret: string;
  encryptionKey: string;
  plexToken?: string;
  tmdbApiKey?: string;
  secretsMigrationVersion?: number;
  [field: string]: unknown;
}

export interface LegacyInstallSeed {
  adminUserId: string;
}

export async function seedLegacyInstall(
  db: mongoose.mongo.Db,
  legacyMasterKey: string
): Promise<LegacyInstallSeed> {
  const jwtSecret = `legacy-jwt-secret-${Date.now()}`;
  const encryptionKey = `legacy-encryption-key-${Date.now()}`;
  const legacyEncrypt = (plain: string, key: string) => CryptoJS.AES.encrypt(plain, key).toString();

  await Promise.all(
    ['settings', 'users', 'librarycaches'].map((name) => db.collection(name).deleteMany({}))
  );

  const now = new Date();
  const { insertedId: adminUserId } = await db.collection('users').insertOne({
    plexUserId: LEGACY_ADMIN_PLEX_USER_ID,
    plexUsername: E2E_MOCK_OAUTH_USER.username,
    plexToken: legacyEncrypt(LEGACY_PLAINTEXT.plexToken, encryptionKey),
    isAdmin: true,
    isApproved: true,
    sessionVersion: 0,
    preferences: { selectedLibraries: [LEGACY_LIBRARY_ID] },
    createdAt: now,
    updatedAt: now,
  });

  await db.collection<StoredSettings>('settings').insertOne({
    _id: 'app-settings',
    jwtSecret: legacyEncrypt(jwtSecret, legacyMasterKey),
    encryptionKey: legacyEncrypt(encryptionKey, legacyMasterKey),
    plexToken: legacyEncrypt(LEGACY_PLAINTEXT.plexToken, encryptionKey),
    tmdbApiKey: legacyEncrypt(LEGACY_PLAINTEXT.tmdbApiKey, encryptionKey),
    plexServerUrl: 'http://192.168.1.10:32400',
    plexUsername: E2E_MOCK_OAUTH_USER.username,
    plexMachineId: LEGACY_MACHINE_ID,
    adminUserId,
    approvedPlexUserIds: [],
    tautulliEnabled: false,
    overseerrFilterEnabled: false,
    syncFrequencyHours: 24,
    setupComplete: true,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('librarycaches').insertOne({
    plexMachineId: LEGACY_MACHINE_ID,
    libraryId: LEGACY_LIBRARY_ID,
    libraryName: 'Movies',
    mediaType: 'movie',
    items: [
      { plexId: 'movie-1', title: 'Legacy Movie One', year: 2020, thumbPath: '/library/metadata/1/thumb', type: 'movie' },
      { plexId: 'movie-2', title: 'Legacy Movie Two', year: 2021, thumbPath: '/library/metadata/2/thumb', type: 'movie' },
    ],
    lastSyncedAt: now,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
  });

  return { adminUserId: adminUserId.toString() };
}
