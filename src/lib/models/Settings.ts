import mongoose, { Document, Model, Types } from 'mongoose';
import CryptoJS from 'crypto-js';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'crypto';
import { createLogger } from '../logger';
import type {
  AppTheme,
  AnimationStyle,
  AnimationSpeed,
} from '@/types/shared';
import { APP_THEMES, ANIMATION_STYLES, ANIMATION_SPEEDS } from '@/types/shared';

const logger = createLogger('Settings');

export interface ISpinHistoryPreferences {
  enabled: boolean;
  retentionLimit: number;
  storeFilterSnapshot: boolean;
}

export interface IUIPreferences {
  theme: AppTheme;
  defaultMediaType: 'movie' | 'show';
  tvSelectionMode: 'show' | 'episode';
  animationStyle: AnimationStyle;
  animationSpeed: AnimationSpeed;
}

export interface ISettings extends Omit<Document, '_id'> {
  // Singleton identifier
  _id: string;

  // Secret migration tracking
  secretsMigrationVersion?: number;

  // Security keys (auto-generated, stored encrypted with master key)
  jwtSecret: string;
  encryptionKey: string;

  // Plex configuration
  plexToken?: string;
  plexServerUrl?: string;
  plexUsername?: string;
  plexMachineId?: string;

  // TMDB configuration
  tmdbApiKey?: string;

  // Tautulli configuration
  tautulliUrl?: string;
  tautulliApiKey?: string;
  tautulliEnabled: boolean;
  tautulliSyncIntervalMinutes: number;
  tautulliLastSync?: Date;

  // Overseerr configuration
  overseerrUrl?: string;
  overseerrApiKey?: string;
  overseerrFilterEnabled: boolean;
  overseerrLastSyncAt?: Date;
  overseerrLastSyncOk: boolean;
  overseerrLastSyncError?: string;

  // Sync settings
  syncFrequencyHours: number;

  // UI Preferences
  uiPreferences: IUIPreferences;

  // Spin history preferences (single-user / installation scope)
  spinHistoryPreferences: ISpinHistoryPreferences;

  // Multi-user
  adminUserId?: Types.ObjectId;
  approvedPlexUserIds: string[];

  // Setup status
  setupComplete: boolean;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  getDecryptedPlexToken(): string | null;
  getDecryptedTmdbKey(): string | null;
  getDecryptedTautulliKey(): string | null;
  getDecryptedOverseerrKey(): string | null;
  getJwtSecret(): string;
  getEncryptionKey(): string;
}

// Encryption version constants
const ENCRYPTION_VERSION_LEGACY = 1; // CryptoJS AES
const ENCRYPTION_VERSION_CURRENT = 2; // AES-256-GCM
const CURRENT_MIGRATION_VERSION = 2;

// Master key for encrypting the auto-generated secrets
const getLegacyMasterKey = (): string => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/decidarr';
  return CryptoJS.SHA256('decidarr-master-' + mongoUri).toString().substring(0, 32);
};

const getMasterKey = (): string => {
  const secret = process.env.DECIDARR_SECRET?.trim();
  if (secret) {
    return CryptoJS.SHA256('decidarr-secret-' + secret).toString().substring(0, 32);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DECIDARR_SECRET is required in production');
  }
  return getLegacyMasterKey();
};

export function getLegacySettingsMasterKey(): string {
  return getLegacyMasterKey();
}

export function getCurrentSettingsMasterKey(): string {
  return getMasterKey();
}

export { CURRENT_MIGRATION_VERSION, encryptWithAesGcm, decryptVersioned };

/**
 * Encrypt a value with AES-256-GCM using Node's built-in crypto.
 * Returns format: "v2:<iv>:<authTag>:<ciphertext>" (all base64)
 */
function encryptWithAesGcm(plaintext: string, masterKey: string): string {
  // Derive a 32-byte key from the master key
  const keyBuffer = createHash('sha256').update(masterKey).digest();

  // Generate a random 12-byte IV (recommended for GCM)
  const iv = randomBytes(12);

  // Create cipher
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);

  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Return versioned format: v2:<iv>:<authTag>:<ciphertext>
  return `v2:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a versioned encrypted value.
 * Supports:
 * - v2: AES-256-GCM (current)
 * - v1 or unversioned: CryptoJS AES (legacy)
 */
function decryptVersioned(encrypted: string, masterKey: string): string {
  // Check for v2 format
  if (encrypted.startsWith('v2:')) {
    const parts = encrypted.split(':');
    if (parts.length !== 4) {
      logger.error('Malformed v2 encrypted value');
      throw new Error('Failed to decrypt value');
    }

    const iv = Buffer.from(parts[1], 'base64');
    const authTag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');

    // Derive the same key
    const keyBuffer = createHash('sha256').update(masterKey).digest();

    try {
      const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      logger.error('Failed to decrypt AES-256-GCM value', { error: String(err) });
      throw new Error('Failed to decrypt value');
    }
  }

  // Legacy CryptoJS format (v1 or unversioned)
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, masterKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      logger.error('Decryption produced empty result');
      throw new Error('Failed to decrypt value');
    }
    return decrypted;
  } catch (err) {
    logger.error('Failed to decrypt legacy CryptoJS value', { error: String(err) });
    throw new Error('Failed to decrypt value');
  }
}

const settingsSchema = new mongoose.Schema<ISettings>(
  {
    _id: { type: String, default: 'app-settings' },

    // Secret migration tracking
    secretsMigrationVersion: { type: Number },

    // Auto-generated security keys (encrypted)
    jwtSecret: { type: String, required: true },
    encryptionKey: { type: String, required: true },

    // Plex configuration (encrypted)
    plexToken: { type: String },
    plexServerUrl: { type: String },
    plexUsername: { type: String },
    plexMachineId: { type: String },

    // TMDB configuration (encrypted)
    tmdbApiKey: { type: String },

    // Tautulli configuration
    tautulliUrl: { type: String },
    tautulliApiKey: { type: String },
    tautulliEnabled: { type: Boolean, default: false },
    tautulliSyncIntervalMinutes: { type: Number, default: 30 },
    tautulliLastSync: { type: Date },

    // Overseerr configuration
    overseerrUrl: { type: String },
    overseerrApiKey: { type: String },
    overseerrFilterEnabled: { type: Boolean, default: false },
    overseerrLastSyncAt: { type: Date },
    overseerrLastSyncOk: { type: Boolean, default: true },
    overseerrLastSyncError: { type: String },

    // Sync settings
    syncFrequencyHours: { type: Number, default: 24 },

    // UI Preferences
    uiPreferences: {
      theme: { type: String, enum: APP_THEMES, default: 'dark' },
      defaultMediaType: { type: String, enum: ['movie', 'show'], default: 'movie' },
      tvSelectionMode: { type: String, enum: ['show', 'episode'], default: 'show' },
      animationStyle: {
        type: String,
        enum: ANIMATION_STYLES,
        default: 'slots',
      },
      animationSpeed: {
        type: String,
        enum: ANIMATION_SPEEDS,
        default: 'normal',
      },
    },

    spinHistoryPreferences: {
      enabled: { type: Boolean, default: true },
      retentionLimit: { type: Number, default: 50, min: 1, max: 500 },
      storeFilterSnapshot: { type: Boolean, default: true },
    },

    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedPlexUserIds: { type: [String], default: [] },

    // Setup status
    setupComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Generate secure random keys
const generateSecureKey = (length: number = 64): string => {
  return randomBytes(length).toString('hex');
};

// Encrypt a value with the master key
// Uses AES-256-GCM (v2) when DECIDARR_SECRET is set, CryptoJS (v1) otherwise
const encryptWithMaster = (value: string): string => {
  const masterKey = getMasterKey();

  // Use AES-256-GCM when DECIDARR_SECRET is set
  if (process.env.DECIDARR_SECRET?.trim()) {
    return encryptWithAesGcm(value, masterKey);
  }

  // Otherwise use legacy CryptoJS for backward compatibility
  return CryptoJS.AES.encrypt(value, masterKey).toString();
};

// Decrypt a value with the master key (version-aware)
const decryptWithMaster = (encrypted: string): string => {
  const currentKey = getMasterKey();

  try {
    return decryptVersioned(encrypted, currentKey);
  } catch (err) {
    // If we have DECIDARR_SECRET set and decryption failed with current key,
    // try the legacy key (for migration scenarios)
    if (process.env.DECIDARR_SECRET?.trim() && !encrypted.startsWith('v2:')) {
      try {
        return decryptVersioned(encrypted, getLegacyMasterKey());
      } catch {
        // Fall through to throw the original error
      }
    }
    throw err;
  }
};

// Methods to get decrypted values
settingsSchema.methods.getDecryptedPlexToken = function(): string | null {
  if (!this.plexToken) return null;
  try {
    const encryptionKey = this.getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(this.plexToken, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
};

settingsSchema.methods.getDecryptedTmdbKey = function(): string | null {
  if (!this.tmdbApiKey) return null;
  try {
    const encryptionKey = this.getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(this.tmdbApiKey, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
};

settingsSchema.methods.getDecryptedTautulliKey = function(): string | null {
  if (!this.tautulliApiKey) return null;
  try {
    const encryptionKey = this.getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(this.tautulliApiKey, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
};

settingsSchema.methods.getDecryptedOverseerrKey = function(): string | null {
  if (!this.overseerrApiKey) return null;
  try {
    const encryptionKey = this.getEncryptionKey();
    const bytes = CryptoJS.AES.decrypt(this.overseerrApiKey, encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
};

settingsSchema.methods.getJwtSecret = function(): string {
  const secret = decryptWithMaster(this.jwtSecret);
  if (!secret) throw new Error('JWT secret could not be decrypted');
  return secret;
};

settingsSchema.methods.getEncryptionKey = function(): string {
  const key = decryptWithMaster(this.encryptionKey);
  if (!key) throw new Error('Encryption key could not be decrypted');
  return key;
};

// Pre-save hook to encrypt sensitive fields
settingsSchema.pre('save', function(next) {
  let encryptionKey: string;

  try {
    encryptionKey = this.getEncryptionKey();
  } catch (err) {
    // If we can't decrypt the encryption key, fail the save
    // This prevents saving credentials in plaintext
    logger.error('Cannot save Settings: encryption key unavailable', {
      error: String(err),
    });
    return next(new Error('Encryption key unavailable - cannot save encrypted fields'));
  }

  // Encrypt plex token if modified and not already encrypted
  if (this.isModified('plexToken') && this.plexToken && !this.plexToken.startsWith('U2F')) {
    this.plexToken = CryptoJS.AES.encrypt(this.plexToken, encryptionKey).toString();
  }

  // Encrypt TMDB key if modified and not already encrypted
  if (this.isModified('tmdbApiKey') && this.tmdbApiKey && !this.tmdbApiKey.startsWith('U2F')) {
    this.tmdbApiKey = CryptoJS.AES.encrypt(this.tmdbApiKey, encryptionKey).toString();
  }

  // Encrypt Tautulli API key if modified and not already encrypted
  if (this.isModified('tautulliApiKey') && this.tautulliApiKey && !this.tautulliApiKey.startsWith('U2F')) {
    this.tautulliApiKey = CryptoJS.AES.encrypt(this.tautulliApiKey, encryptionKey).toString();
  }

  // Encrypt Overseerr API key if modified and not already encrypted
  if (this.isModified('overseerrApiKey') && this.overseerrApiKey && !this.overseerrApiKey.startsWith('U2F')) {
    this.overseerrApiKey = CryptoJS.AES.encrypt(this.overseerrApiKey, encryptionKey).toString();
  }

  next();
});

export const Settings: Model<ISettings> =
  mongoose.models.Settings || mongoose.model<ISettings>('Settings', settingsSchema);

// Helper function to get or create settings (singleton pattern)
/**
 * Recovery function for DECIDARR_SECRET changes.
 * When the master key changes and existing secrets can't be decrypted:
 * - Generate fresh jwtSecret and encryptionKey
 * - Clear all encrypted integration credentials
 * - Clear all user plexTokens
 * - Keep admin users so they can re-login
 */
export async function recoverFromSecretChange(): Promise<ISettings> {
  logger.warn('DECIDARR_SECRET changed - initiating recovery with fresh keys');

  const settings = await Settings.findById('app-settings');
  if (!settings) {
    throw new Error('Settings document not found during recovery');
  }

  // Generate fresh security keys and encrypt with the NEW master key
  const newJwtSecret = generateSecureKey(64);
  const newEncryptionKey = generateSecureKey(32);
  const masterKey = getCurrentSettingsMasterKey();

  settings.jwtSecret = encryptWithAesGcm(newJwtSecret, masterKey);
  settings.encryptionKey = encryptWithAesGcm(newEncryptionKey, masterKey);
  settings.secretsMigrationVersion = CURRENT_MIGRATION_VERSION;

  // Clear all encrypted integration credentials
  settings.plexToken = undefined;
  settings.tmdbApiKey = undefined;
  settings.tautulliApiKey = undefined;
  settings.overseerrApiKey = undefined;

  await settings.save();

  // Clear plexToken from all users, but keep the users themselves
  const { User } = await import('./User');
  const result = await User.updateMany(
    { plexToken: { $exists: true } },
    { $unset: { plexToken: '' } }
  );

  logger.info('Secret recovery complete', {
    clearedUserTokens: result.modifiedCount,
  });

  return settings;
}

export async function getOrCreateSettings(): Promise<ISettings> {
  let settings = await Settings.findById('app-settings');

  if (!settings) {
    // Generate new secure keys
    const jwtSecret = generateSecureKey(64);
    const encryptionKey = generateSecureKey(32);

    try {
      settings = await Settings.create({
        _id: 'app-settings',
        jwtSecret: encryptWithMaster(jwtSecret),
        encryptionKey: encryptWithMaster(encryptionKey),
        syncFrequencyHours: 24,
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
        approvedPlexUserIds: [],
        setupComplete: false,
      });
    } catch (err) {
      const duplicate =
        (err as { code?: number })?.code === 11000 ||
        String((err as Error).message).includes('E11000');
      if (duplicate) {
        settings = await Settings.findById('app-settings');
        if (!settings) throw err;
      } else {
        throw err;
      }
    }
  }

  if (!settings.approvedPlexUserIds) {
    settings.approvedPlexUserIds = [];
  }

  return settings;
}

// Helper to check if app is configured
export async function isAppConfigured(): Promise<boolean> {
  try {
    const settings = await Settings.findById('app-settings');
    return settings?.setupComplete ?? false;
  } catch {
    return false;
  }
}
