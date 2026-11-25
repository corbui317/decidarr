/**
 * Encryption of the secrets Decidarr stores in MongoDB, and the keys behind it.
 *
 * Every key is derived from DECIDARR_SECRET with HKDF-SHA256, one key per purpose.
 * Stored secrets use the v3 format documented in docs/stored-secrets.md:
 * AES-256-GCM with a 16-byte tag and AAD that binds each value to its record and field.
 * Values written by older versions (v2 and CryptoJS) are read only by the migration,
 * which re-encrypts them as v3.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'crypto';
import CryptoJS from 'crypto-js';

/** What a derived key is for. A key is never used for more than one purpose. */
export type KeyPurpose = 'stored-secrets' | 'web-session' | 'mobile-access-token';

/** Where a stored secret lives; the v3 AAD binds the ciphertext to it. */
export interface SecretLocation {
  recordType: 'settings' | 'user' | 'mobileAuthCode';
  recordId: string;
  field: string;
}

/** Thrown when a stored value cannot be decrypted. Never carries the value itself. */
export class SecretUnreadableError extends Error {
  constructor(location: SecretLocation) {
    super(`Stored secret ${location.recordType}.${location.field} cannot be decrypted`);
    this.name = 'SecretUnreadableError';
  }
}

const IV_BYTES = 12;
const TAG_BYTES = 16;
const V3_PATTERN = /^v3:([A-Za-z0-9_-]{16}):([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]*)$/;

function rootSecret(): string {
  const secret = process.env.DECIDARR_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DECIDARR_SECRET is required in production');
  }
  // Development and tests may run without a secret; fall back to the legacy URI-derived key.
  return getLegacyMasterKey();
}

/** A 32-byte key for one purpose, derived from DECIDARR_SECRET. */
export function deriveKey(purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', rootSecret(), 'decidarr', `decidarr:${purpose}`, 32));
}

function aad({ recordType, recordId, field }: SecretLocation): Buffer {
  return Buffer.from(`decidarr:v3:${recordType}:${recordId}:${field}`, 'utf8');
}

/** True for a well-formed v3 value, so a plaintext about to be stored is never mistaken for one. */
export function isCurrentCiphertext(value: string): boolean {
  return V3_PATTERN.test(value);
}

export function encryptSecret(plaintext: string, location: SecretLocation): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey('stored-secrets'), iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad(location));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v3:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/** Decrypts a v3 value; throws SecretUnreadableError for anything else or a failed check. */
export function decryptSecret(stored: string, location: SecretLocation): string {
  const match = V3_PATTERN.exec(stored);
  if (!match) throw new SecretUnreadableError(location);
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey('stored-secrets'),
      Buffer.from(match[1], 'base64url'),
      { authTagLength: TAG_BYTES }
    );
    decipher.setAAD(aad(location));
    decipher.setAuthTag(Buffer.from(match[2], 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(match[3], 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new SecretUnreadableError(location);
  }
}

// ---------------------------------------------------------------------------
// Legacy formats, read only to upgrade them to v3.
//
// Before v3, settings.encryptionKey held a random data key, wrapped with a master key:
// CryptoJS under a key derived from MONGODB_URI, or "v2:" AES-256-GCM under a key
// derived from DECIDARR_SECRET. Secrets were encrypted with that data key, as CryptoJS
// passphrase ciphertext or "v2:<iv>:<tag>:<ciphertext>" (base64) with no AAD.
// ---------------------------------------------------------------------------

/** base64("Salted__"): every CryptoJS passphrase ciphertext starts with it. */
const CRYPTOJS_SALTED_PREFIX = 'U2FsdGVkX1';

/** The master key of installs from before DECIDARR_SECRET existed. */
export function getLegacyMasterKey(): string {
  return legacyMasterKeyFor(process.env.MONGODB_URI || 'mongodb://localhost:27017/decidarr');
}

export function legacyMasterKeyFor(mongoUri: string): string {
  return CryptoJS.SHA256('decidarr-master-' + mongoUri).toString().substring(0, 32);
}

export function isLegacyCiphertext(value: string): boolean {
  return value.startsWith('v2:') || value.startsWith(CRYPTOJS_SALTED_PREFIX);
}

/** Decrypts a v2 or CryptoJS value with a legacy key string; throws on any failure. */
export function decryptLegacy(encrypted: string, key: string): string {
  if (encrypted.startsWith('v2:')) {
    const parts = encrypted.split(':');
    if (parts.length !== 4) throw new Error('Failed to decrypt value');
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        createHash('sha256').update(key).digest(),
        Buffer.from(parts[1], 'base64'),
        { authTagLength: TAG_BYTES }
      );
      decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Failed to decrypt value');
    }
  }

  // Without the "Salted__" header CryptoJS would pick a random salt and sometimes
  // "decrypt" garbage into a non-empty string.
  if (!encrypted.startsWith(CRYPTOJS_SALTED_PREFIX)) throw new Error('Failed to decrypt value');
  let decrypted = '';
  try {
    decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
  } catch {
    // Malformed UTF-8 means the wrong key.
  }
  if (!decrypted) throw new Error('Failed to decrypt value');
  return decrypted;
}

/** Unwraps the legacy data key kept in settings.encryptionKey; throws if the master key changed. */
export function unwrapLegacyDataKey(wrapped: string): string {
  const secret = process.env.DECIDARR_SECRET?.trim();
  const masterKey =
    wrapped.startsWith('v2:') && secret
      ? CryptoJS.SHA256('decidarr-secret-' + secret).toString().substring(0, 32)
      : getLegacyMasterKey();
  return decryptLegacy(wrapped, masterKey);
}
