import mongoose, { Document, Model, Types } from 'mongoose';
import { decryptSecret, encryptSecret, isCurrentCiphertext } from '../secrets';
import {
  APP_THEMES,
  ANIMATION_STYLES,
  ANIMATION_SPEEDS,
  type AppTheme,
  type MediaType,
  type TvSelectionMode,
  type AnimationStyle,
  type AnimationSpeed,
} from '@decidarr/api-contracts';

export interface ISpinHistoryPreferences {
  enabled: boolean;
  retentionLimit: number;
  storeFilterSnapshot: boolean;
}

export interface IUIPreferences {
  theme: AppTheme;
  defaultMediaType: MediaType;
  tvSelectionMode: TvSelectionMode;
  animationStyle: AnimationStyle;
  animationSpeed: AnimationSpeed;
}

export interface ISettings extends Omit<Document, '_id'> {
  // Singleton identifier
  _id: string;

  /** Legacy wrapped data key, kept only to upgrade values written before v3 (see docs/stored-secrets.md). */
  encryptionKey?: string;

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
}

/** Settings fields that hold v3 ciphertext. Assigning plaintext to one encrypts it on save. */
export const SETTINGS_SECRET_FIELDS = ['plexToken', 'tmdbApiKey', 'tautulliApiKey', 'overseerrApiKey'] as const;
export type SettingsSecretField = (typeof SETTINGS_SECRET_FIELDS)[number];

export const SETTINGS_ID = 'app-settings';

const settingsSchema = new mongoose.Schema<ISettings>(
  {
    _id: { type: String, default: SETTINGS_ID },

    // Legacy wrapped data key; read only to upgrade pre-v3 values.
    encryptionKey: { type: String },

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

function readSecret(settings: ISettings, field: SettingsSecretField): string | null {
  const stored = settings[field];
  if (!stored) return null;
  try {
    return decryptSecret(stored, { recordType: 'settings', recordId: SETTINGS_ID, field });
  } catch {
    // Unreadable values are kept as they are and reported to the Admin for re-entry.
    return null;
  }
}

settingsSchema.methods.getDecryptedPlexToken = function (this: ISettings) {
  return readSecret(this, 'plexToken');
};
settingsSchema.methods.getDecryptedTmdbKey = function (this: ISettings) {
  return readSecret(this, 'tmdbApiKey');
};
settingsSchema.methods.getDecryptedTautulliKey = function (this: ISettings) {
  return readSecret(this, 'tautulliApiKey');
};
settingsSchema.methods.getDecryptedOverseerrKey = function (this: ISettings) {
  return readSecret(this, 'overseerrApiKey');
};

settingsSchema.pre('save', function () {
  for (const field of SETTINGS_SECRET_FIELDS) {
    const value = this[field];
    if (this.isModified(field) && value && !isCurrentCiphertext(value)) {
      this[field] = encryptSecret(value, { recordType: 'settings', recordId: SETTINGS_ID, field });
    }
  }
});

export const Settings: Model<ISettings> =
  mongoose.models.Settings || mongoose.model<ISettings>('Settings', settingsSchema);

// Helper function to get or create settings (singleton pattern)
export async function getOrCreateSettings(): Promise<ISettings> {
  let settings = await Settings.findById(SETTINGS_ID);

  if (!settings) {
    try {
      settings = await Settings.create({
        _id: SETTINGS_ID,
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
        settings = await Settings.findById(SETTINGS_ID);
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
    const settings = await Settings.findById(SETTINGS_ID);
    return settings?.setupComplete ?? false;
  } catch {
    return false;
  }
}
