import mongoose, { Document, Model } from 'mongoose';
import { decryptSecret, encryptSecret, type SecretLocation } from '../secrets';
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
  /** Pre-v2 plex.tv account token; only the upgrade reads it, then removes it (ADR 0002). */
  plexToken?: string;
  /** This user's access token for the configured Plex server; every Plex server call uses it. */
  plexServerToken?: string;
  /** The machine id of the Plex server plexServerToken belongs to; the token is used only while that server is configured. */
  plexServerMachineId?: string;
  /** The Admin's plex.tv account token, kept because listing Friends needs it. Never set for a Friend. */
  plexAccountToken?: string;
  plexUserId: string;
  plexUsername?: string;
  plexEmail?: string;
  plexThumb?: string;
  isAdmin: boolean;
  isApproved: boolean;
  sessionVersion: number;
  lastLoginAt?: Date;
  tokenValidatedAt?: Date;
  preferences: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
  /** Stores the tokens a sign-in yields; a Friend's account token is never stored. */
  setPlexTokens(tokens: { serverToken: string; accountToken: string | null; machineId: string }): void;
  /**
   * The token for the server with `machineId`; null when none is stored for that server, so a token
   * for another server is never sent to this one. Throws SecretUnreadableError when it cannot be decrypted.
   */
  getServerToken(machineId: string | undefined): string | null;
  /** Null when none is stored; throws SecretUnreadableError when it cannot be decrypted. */
  getAccountToken(): string | null;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    plexToken: { type: String },
    plexServerToken: { type: String },
    plexServerMachineId: { type: String },
    plexAccountToken: { type: String },
    plexUserId: { type: String, required: true, unique: true },
    plexUsername: { type: String },
    plexEmail: { type: String },
    plexThumb: { type: String },
    isAdmin: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0 },
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

export const USER_TOKEN_FIELDS = ['plexToken', 'plexServerToken', 'plexAccountToken'] as const;
export type UserTokenField = (typeof USER_TOKEN_FIELDS)[number];

export function userTokenLocation(user: Pick<IUser, '_id'>, field: UserTokenField): SecretLocation {
  return { recordType: 'user', recordId: String(user._id), field };
}

userSchema.methods.setPlexTokens = function (
  this: IUser,
  { serverToken, accountToken, machineId }: { serverToken: string; accountToken: string | null; machineId: string }
): void {
  this.plexServerToken = encryptSecret(serverToken, userTokenLocation(this, 'plexServerToken'));
  this.plexServerMachineId = machineId;
  this.plexAccountToken = accountToken
    ? encryptSecret(accountToken, userTokenLocation(this, 'plexAccountToken'))
    : undefined;
  this.plexToken = undefined;
};

userSchema.methods.getServerToken = function (this: IUser, machineId: string | undefined): string | null {
  if (!machineId || this.plexServerMachineId !== machineId) return null;
  return this.plexServerToken ? decryptSecret(this.plexServerToken, userTokenLocation(this, 'plexServerToken')) : null;
};

userSchema.methods.getAccountToken = function (this: IUser): string | null {
  return this.plexAccountToken
    ? decryptSecret(this.plexAccountToken, userTokenLocation(this, 'plexAccountToken'))
    : null;
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
