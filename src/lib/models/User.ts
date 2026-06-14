import mongoose, { Document, Model, Types } from 'mongoose';
import CryptoJS from 'crypto-js';
import { getOrCreateSettings } from './Settings';

export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';
export type AnimationStyle = 'slots' | 'roulette' | 'wheel' | 'plinko' | 'random';
export type AnimationSpeed = 'fast' | 'normal' | 'dramatic';

export interface IUserPreferences {
  theme?: AppTheme;
  selectedLibraries?: string[];
  defaultMediaType?: 'movie' | 'show';
  tvSelectionMode?: 'show' | 'episode';
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  savedFilters?: {
    genres?: string[];
    yearRange?: { start?: number; end?: number };
    collections?: string[];
    unwatchedOnly?: boolean;
  };
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
  setEncryptedToken(plainToken: string, encryptionKey: string): void;
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
        enum: ['dark', 'light', 'vegas', 'macao', 'poker'],
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
        enum: ['slots', 'roulette', 'wheel', 'plinko', 'random'],
        default: 'slots',
      },
      animationSpeed: {
        type: String,
        enum: ['fast', 'normal', 'dramatic'],
        default: 'normal',
      },
      savedFilters: {
        genres: [String],
        yearRange: { start: Number, end: Number },
        collections: [String],
        unwatchedOnly: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ isApproved: 1 });

userSchema.methods.setEncryptedToken = function (plainToken: string, encryptionKey: string): void {
  this.plexToken = CryptoJS.AES.encrypt(plainToken, encryptionKey).toString();
};

userSchema.methods.getDecryptedToken = function (): string {
  const key = (this as IUser & { _encryptionKey?: string })._encryptionKey;
  if (!key) {
    throw new Error('Encryption key not loaded for user token decryption');
  }
  const bytes = CryptoJS.AES.decrypt(this.plexToken, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export async function loadUserWithToken(userId: Types.ObjectId | string): Promise<IUser | null> {
  const settings = await getOrCreateSettings();
  const encryptionKey = settings.getEncryptionKey();
  const user = await User.findById(userId);
  if (!user) return null;
  (user as IUser & { _encryptionKey?: string })._encryptionKey = encryptionKey;
  return user;
}

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
