/**
 * Seeds a pre-v3 install exactly as it sits on disk before the secret migration.
 * `seedLegacyInstall` writes a pre-DECIDARR_SECRET install: CryptoJS ciphertext
 * with no version prefix and the master key derived from MONGODB_URI.
 * `seedV2Install` writes an install that already ran with DECIDARR_SECRET:
 * "v2:" AES-256-GCM values with no AAD.
 *
 * Shared by the Vitest upgrade test and the E2E upgrade spec, so both
 * exercise the same legacy data.
 */
import CryptoJS from 'crypto-js';
import { createCipheriv, createHash, randomBytes } from 'crypto';
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
  /** Written only by installs from before v3. */
  jwtSecret?: string;
  /** Written only by installs from before v3; kept to upgrade their values. */
  encryptionKey?: string;
  plexToken?: string;
  tmdbApiKey?: string;
  [field: string]: unknown;
}

export interface LegacyInstallSeed {
  adminUserId: string;
}

type LegacyEncrypt = (plain: string, key: string) => string;

const cryptoJsEncrypt: LegacyEncrypt = (plain, key) => CryptoJS.AES.encrypt(plain, key).toString();

/** The "v2:<iv>:<tag>:<ciphertext>" format: AES-256-GCM keyed by SHA-256 of the key string. */
const v2Encrypt: LegacyEncrypt = (plain, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v2:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`;
};

export function seedLegacyInstall(db: mongoose.mongo.Db, legacyMasterKey: string): Promise<LegacyInstallSeed> {
  return seedInstall(db, legacyMasterKey, cryptoJsEncrypt);
}

export function seedV2Install(db: mongoose.mongo.Db, decidarrSecret: string): Promise<LegacyInstallSeed> {
  const masterKey = CryptoJS.SHA256('decidarr-secret-' + decidarrSecret).toString().substring(0, 32);
  return seedInstall(db, masterKey, v2Encrypt);
}

async function seedInstall(
  db: mongoose.mongo.Db,
  masterKey: string,
  legacyEncrypt: LegacyEncrypt
): Promise<LegacyInstallSeed> {
  const jwtSecret = `legacy-jwt-secret-${Date.now()}`;
  const encryptionKey = `legacy-encryption-key-${Date.now()}`;

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
    preferences: {},
    createdAt: now,
    updatedAt: now,
  });

  await db.collection<StoredSettings>('settings').insertOne({
    _id: 'app-settings',
    jwtSecret: legacyEncrypt(jwtSecret, masterKey),
    encryptionKey: legacyEncrypt(encryptionKey, masterKey),
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
