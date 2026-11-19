/**
 * Shared helper for legacy CryptoJS encryption used in E2E migration tests.
 * This matches the pre-migration encryption format that the app needs to migrate from.
 */
import CryptoJS from 'crypto-js';

export interface LegacyEncryptedData {
  jwtSecret: string;
  encryptionKey: string;
  plexToken: string;
  tmdbApiKey: string;
}

/**
 * Creates legacy-encrypted settings data as it would have existed before migration.
 * Uses CryptoJS AES encryption (no v2: prefix) with a legacy master key.
 */
export function createLegacyEncryptedData(legacyMasterKey: string): LegacyEncryptedData {
  // Generate secure keys (plaintext)
  const jwtSecret = 'legacy-jwt-secret-' + Date.now();
  const encryptionKey = 'legacy-encryption-key-' + Date.now();

  // Encrypt jwtSecret and encryptionKey with legacy master key
  const encryptedJwt = CryptoJS.AES.encrypt(jwtSecret, legacyMasterKey).toString();
  const encryptedKey = CryptoJS.AES.encrypt(encryptionKey, legacyMasterKey).toString();

  // Encrypt integration credentials with the encryption key
  const plexToken = CryptoJS.AES.encrypt('test-plex-token-legacy', encryptionKey).toString();
  const tmdbKey = CryptoJS.AES.encrypt('test-tmdb-key-legacy', encryptionKey).toString();

  return {
    jwtSecret: encryptedJwt,
    encryptionKey: encryptedKey,
    plexToken,
    tmdbApiKey: tmdbKey,
  };
}
