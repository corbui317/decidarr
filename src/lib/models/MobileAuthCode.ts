import mongoose, { Document, Model, Types } from 'mongoose';
import { decryptSecret, encryptSecret, type SecretLocation } from '../secrets';

export interface IMobileAuthCode extends Document {
  deviceCode: string;
  deviceId: string;
  deviceName?: string;
  pinId: number;
  pinCode: string;
  userId?: Types.ObjectId;
  /** The approved Plex token, encrypted in the v3 format (see docs/stored-secrets.md). */
  plexAuthToken?: string;
  expiresAt: Date;
  exchangedAt?: Date;
  createdAt: Date;
  setEncryptedPlexAuthToken(plainToken: string): void;
  /** Null when no token is stored or it cannot be decrypted; the PIN is then polled again. */
  getDecryptedPlexAuthToken(): string | null;
}

const mobileAuthCodeSchema = new mongoose.Schema<IMobileAuthCode>(
  {
    deviceCode: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String },
    pinId: { type: Number, required: true },
    pinCode: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    plexAuthToken: { type: String },
    expiresAt: { type: Date, required: true },
    exchangedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

mobileAuthCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function authCodeTokenLocation(code: Pick<IMobileAuthCode, '_id'>): SecretLocation {
  return { recordType: 'mobileAuthCode', recordId: String(code._id), field: 'plexAuthToken' };
}

mobileAuthCodeSchema.methods.setEncryptedPlexAuthToken = function (
  this: IMobileAuthCode,
  plainToken: string
): void {
  this.plexAuthToken = encryptSecret(plainToken, authCodeTokenLocation(this));
};

mobileAuthCodeSchema.methods.getDecryptedPlexAuthToken = function (
  this: IMobileAuthCode
): string | null {
  if (!this.plexAuthToken) return null;
  try {
    return decryptSecret(this.plexAuthToken, authCodeTokenLocation(this));
  } catch {
    return null;
  }
};

export const MobileAuthCode: Model<IMobileAuthCode> =
  mongoose.models.MobileAuthCode ||
  mongoose.model<IMobileAuthCode>('MobileAuthCode', mobileAuthCodeSchema);
