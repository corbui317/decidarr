import mongoose, { Document, Model } from 'mongoose';
import { decryptSecret, encryptSecret, type SecretLocation } from '../secrets';
import type { AppTheme, MediaType, TvSelectionMode, AnimationStyle, AnimationSpeed } from '@/types/shared';
import { APP_THEMES, ANIMATION_STYLES, ANIMATION_SPEEDS } from '@/types/shared';

// Re-export for backward compatibility
export type { AppTheme, AnimationStyle, AnimationSpeed };

export interface ISpinHistoryPreferences {
  enabled: boolean;
  retentionLimit: number;
  storeFilterSnapshot: boolean;
}

export interface IUserPreferences {
  theme?: AppTheme;
  selectedLibraries?: string[];
  defaultMediaType?: MediaType;
  tvSelectionMode?: TvSelectionMode;
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  savedFilters?: {
    genres?: string[];
    yearRange?: { start?: number; end?: number };
    contentRatings?: string[];
    studios?: string[];
    ratingRange?: { min?: number; max?: number };
    ratingFilter?: string | null;
    collections?: string[];
    unwatchedOnly?: boolean;
  };
  spinHistory?: ISpinHistoryPreferences;
}

export interface IUser extends Document {
  plexToken: string;
  plexUserId: string;
  plexUsername?: string;
  plexEmail?: string;
  plexThumb?: string;
  isAdmin: boolean;
  isApproved: boolean;
  sessionVersion: number;
  tautulliUserId?: number;
  lastLoginAt?: Date;
  tokenValidatedAt?: Date;
  preferences: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
  setEncryptedToken(plainToken: string): void;
  /** Throws SecretUnreadableError when the stored token cannot be decrypted. */
  getDecryptedToken(): string;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    plexToken: { type: String, required: true },
    plexUserId: { type: String, required: true, unique: true },
    plexUsername: { type: String },
    plexEmail: { type: String },
    plexThumb: { type: String },
    isAdmin: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
    tautulliUserId: { type: Number },
    lastLoginAt: { type: Date },
    tokenValidatedAt: { type: Date },
    preferences: {
      theme: {
        type: String,
        enum: APP_THEMES,
        default: 'dark',
      },
      selectedLibraries: [String],
      defaultMediaType: {
        type: String,
        enum: ['movie', 'show'],
        default: 'movie',
      },
      tvSelectionMode: {
        type: String,
        enum: ['show', 'episode'],
        default: 'show',
      },
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
      savedFilters: {
        genres: [String],
        yearRange: { start: Number, end: Number },
        contentRatings: [String],
        studios: [String],
        ratingRange: { min: Number, max: Number },
        ratingFilter: { type: String, default: null },
        collections: [String],
        unwatchedOnly: { type: Boolean, default: false },
      },
      spinHistory: {
        enabled: { type: Boolean, default: true },
        retentionLimit: { type: Number, default: 50, min: 1, max: 500 },
        storeFilterSnapshot: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ isApproved: 1 });

export function userTokenLocation(user: Pick<IUser, '_id'>): SecretLocation {
  return { recordType: 'user', recordId: String(user._id), field: 'plexToken' };
}

userSchema.methods.setEncryptedToken = function (this: IUser, plainToken: string): void {
  this.plexToken = encryptSecret(plainToken, userTokenLocation(this));
};

userSchema.methods.getDecryptedToken = function (this: IUser): string {
  return decryptSecret(this.plexToken, userTokenLocation(this));
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
