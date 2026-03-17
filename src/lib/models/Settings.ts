import mongoose, { Document, Model } from 'mongoose';
import CryptoJS from 'crypto-js';
import crypto from 'crypto';
import { createLogger } from '../logger';

const logger = createLogger('Settings');

export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';

export interface IUIPreferences {
  theme: AppTheme;
  defaultMediaType: 'movie' | 'show';
  tvSelectionMode: 'show' | 'episode';
}

export interface ISettings extends Omit<Document, '_id'> {
  // Singleton identifier
  _id: string;

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

  // Sync settings
  syncFrequencyHours: number;

  // UI Preferences
  uiPreferences: IUIPreferences;

  // Setup status
  setupComplete: boolean;

  createdAt: Date;
  updatedAt: Date;

  // Methods
  getDecryptedPlexToken(): string | null;
  getDecryptedTmdbKey(): string | null;
  getDecryptedTautulliKey(): string | null;
  getJwtSecret(): string;
  getEncryptionKey(): string;
}

// Master key for encrypting the auto-generated secrets
// This is derived from a combination of factors to make it unique per installation
const getMasterKey = (): string => {
  // Use a fixed prefix combined with MongoDB connection info
  // This ensures consistency across restarts while being installation-specific
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/decidarr';
  return CryptoJS.SHA256('decidarr-master-' + mongoUri).toString().substring(0, 32);
};

const settingsSchema = new mongoose.Schema<ISettings>(
  {
    _id: { type: String, default: 'app-settings' },

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

    // Sync settings
    syncFrequencyHours: { type: Number, default: 24 },

    // UI Preferences
    uiPreferences: {
      theme: { type: String, enum: ['dark', 'light', 'vegas', 'macao', 'poker'], default: 'dark' },
      defaultMediaType: { type: String, enum: ['movie', 'show'], default: 'movie' },
      tvSelectionMode: { type: String, enum: ['show', 'episode'], default: 'show' },
    },

    // Setup status
    setupComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Generate secure random keys
const generateSecureKey = (length: number = 64): string => {
  return crypto.randomBytes(length).toString('hex');
};

// Encrypt a value with the master key
const encryptWithMaster = (value: string): string => {
  const masterKey = getMasterKey();
  return CryptoJS.AES.encrypt(value, masterKey).toString();
};

// Decrypt a value with the master key
const decryptWithMaster = (encrypted: string): string => {
  const masterKey = getMasterKey();
  const bytes = CryptoJS.AES.decrypt(encrypted, masterKey);
  return bytes.toString(CryptoJS.enc.Utf8);
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
  const encryptionKey = this.getEncryptionKey();

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

  next();
});

export const Settings: Model<ISettings> =
  mongoose.models.Settings || mongoose.model<ISettings>('Settings', settingsSchema);

// Helper function to get or create settings (singleton pattern)
export async function getOrCreateSettings(): Promise<ISettings> {
  let settings = await Settings.findById('app-settings');

  if (!settings) {
    // Generate new secure keys
    const jwtSecret = generateSecureKey(64);
    const encryptionKey = generateSecureKey(32);

    settings = await Settings.create({
      _id: 'app-settings',
      jwtSecret: encryptWithMaster(jwtSecret),
      encryptionKey: encryptWithMaster(encryptionKey),
      syncFrequencyHours: 24,
      uiPreferences: {
        theme: 'dark',
        defaultMediaType: 'movie',
        tvSelectionMode: 'show',
      },
      setupComplete: false,
    });
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
