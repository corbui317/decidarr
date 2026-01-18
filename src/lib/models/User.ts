import mongoose, { Document, Model } from 'mongoose';
import CryptoJS from 'crypto-js';

export interface IUserPreferences {
  selectedLibraries?: string[];
  defaultMediaType?: 'movie' | 'show';
  tvSelectionMode?: 'show' | 'episode';
  savedFilters?: {
    genres?: string[];
    yearRange?: { start?: number; end?: number };
    collections?: string[];
    unwatchedOnly?: boolean;
  };
}

export interface IUser extends Document {
  plexToken: string;
  plexServerUrl: string;
  plexUserId: string;
  plexUsername?: string;
  plexEmail?: string;
  preferences?: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
  getDecryptedToken(): string;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    plexToken: { type: String, required: true },
    plexServerUrl: { type: String, required: true },
    plexUserId: { type: String, required: true, unique: true },
    plexUsername: { type: String },
    plexEmail: { type: String },
    preferences: {
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

userSchema.pre('save', function (next) {
  if (this.isModified('plexToken')) {
    const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-me';
    this.plexToken = CryptoJS.AES.encrypt(this.plexToken, encryptionKey).toString();
  }
  next();
});

userSchema.methods.getDecryptedToken = function (): string {
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-me';
  const bytes = CryptoJS.AES.decrypt(this.plexToken, encryptionKey);
  return bytes.toString(CryptoJS.enc.Utf8);
};

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', userSchema);
