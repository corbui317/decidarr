import mongoose from 'mongoose';
import CryptoJS from 'crypto-js';
import fs from 'fs';
import path from 'path';

/**
 * Seeds the E2E database with legacy-encrypted settings (pre-migration format).
 * This must be called BEFORE the server starts so the migration runs on startup.
 */

// Read URI the same way playwright.config.ts does for the webServer
function getE2EMongoURI(): string {
  const uriFile = path.join(process.cwd(), '.e2e-mongo-uri');

  // Try .e2e-mongo-uri file first (written by global-setup)
  if (fs.existsSync(uriFile)) {
    const uri = fs.readFileSync(uriFile, 'utf-8').trim();
    if (uri) {
      console.log('[Seed] Using URI from .e2e-mongo-uri file:', uri);
      return uri;
    }
  }

  // Fall back to environment variables
  const uri = process.env.E2E_MONGODB_URI ||
              process.env.MONGODB_URI ||
              'mongodb://127.0.0.1:27017/decidarr-e2e';
  console.log('[Seed] Using URI from env/default:', uri);
  return uri;
}

// Shared Mongo URI constant used by both seed and server
export const E2E_MONGO_URI = getE2EMongoURI();

// Export getMasterKey for E2E test decryption assertions
export function getMasterKey(): string {
  const secret = process.env.DECIDARR_SECRET?.trim();
  if (secret) {
    return CryptoJS.SHA256('decidarr-secret-' + secret).toString().substring(0, 32);
  }
  return CryptoJS.SHA256('decidarr-master-' + E2E_MONGO_URI).toString().substring(0, 32);
}

export async function seedLegacyEncryptedSettings() {
  const mongoUri = E2E_MONGO_URI;

  console.log('[Seed] Connecting to:', mongoUri);
  console.log('[Seed] Database name:', new URL(mongoUri).pathname.substring(1));

  await mongoose.connect(mongoUri);

  // Create legacy master key (without DECIDARR_SECRET)
  const legacyMasterKey = CryptoJS.SHA256('decidarr-master-' + mongoUri).toString().substring(0, 32);
  
  // Generate secure keys
  const jwtSecret = 'legacy-jwt-secret-' + Date.now();
  const encryptionKey = 'legacy-encryption-key-' + Date.now();
  
  // Encrypt with legacy CryptoJS format (no v2: prefix)
  const encryptedJwt = CryptoJS.AES.encrypt(jwtSecret, legacyMasterKey).toString();
  const encryptedKey = CryptoJS.AES.encrypt(encryptionKey, legacyMasterKey).toString();
  
  // Encrypt integration credentials with the encryption key
  const plexToken = CryptoJS.AES.encrypt('test-plex-token-legacy', encryptionKey).toString();
  const tmdbKey = CryptoJS.AES.encrypt('test-tmdb-key-legacy', encryptionKey).toString();
  
  // Insert legacy settings (without secretsMigrationVersion marker)
  await mongoose.connection.db?.collection('settings').deleteMany({});
  await mongoose.connection.db?.collection('settings').insertOne({
    _id: 'app-settings',
    jwtSecret: encryptedJwt,
    encryptionKey: encryptedKey,
    plexToken,
    plexServerUrl: 'http://192.168.1.10:32400',
    plexUsername: 'legacyuser',
    plexMachineId: 'legacy-machine-1',
    tmdbApiKey: tmdbKey,
    tautulliEnabled: false,
    overseerrFilterEnabled: false,
    syncFrequencyHours: 24,
    setupComplete: true, // Setup already complete so we can test login and spin
    approvedPlexUserIds: [],
    uiPreferences: {
      theme: 'dark',
      defaultMediaType: 'movie',
      tvSelectionMode: 'show',
      animationStyle: 'slots',
      animationSpeed: 'normal',
    },
    spinHistoryPreferences: {
      enabled: true,
      retentionLimit: 50,
      storeFilterSnapshot: true,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  
  // Create a legacy admin user
  const userId = new mongoose.Types.ObjectId();
  const userToken = CryptoJS.AES.encrypt('test-plex-token-legacy', encryptionKey).toString();
  
  await mongoose.connection.db?.collection('users').insertOne({
    _id: userId,
    plexUserId: 'legacy-plex-user-1',
    plexUsername: 'legacyuser',
    plexToken: userToken,
    isAdmin: true,
    isApproved: true,
    sessionVersion: 0,
    preferences: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  
  // Update settings to reference this admin user
  await mongoose.connection.db?.collection('settings').updateOne(
    { _id: 'app-settings' } as any,
    { $set: { adminUserId: userId } } as any
  );

  // Seed a library cache entry so spinning is possible
  await mongoose.connection.db?.collection('librarycaches').insertOne({
    plexMachineId: 'legacy-machine-1',
    libraryId: '1',
    libraryName: 'Movies',
    mediaType: 'movie',
    items: [
      {
        plexId: 'movie-1',
        title: 'Test Movie',
        year: 2020,
        thumbPath: '/library/metadata/1/thumb',
        type: 'movie',
      },
      {
        plexId: 'movie-2',
        title: 'Another Movie',
        year: 2021,
        thumbPath: '/library/metadata/2/thumb',
        type: 'movie',
      },
    ],
    lastSyncedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);

  await mongoose.disconnect();
  
  return {
    jwtSecret,
    encryptionKey,
    userId: userId.toString(),
  };
}
