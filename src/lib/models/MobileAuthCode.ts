import mongoose, { Document, Model, Types } from 'mongoose';
import { decryptUserData, encryptUserData } from './Settings';

export interface IMobileAuthCode extends Document {
  deviceCode: string;
  deviceId: string;
  deviceName?: string;
  pinId: number;
  pinCode: string;
  userId?: Types.ObjectId;
  /** The approved Plex token, AES-256-GCM encrypted ("v2:") with the settings encryption key. */
  plexAuthToken?: string;
  expiresAt: Date;
  exchangedAt?: Date;
  createdAt: Date;
  setEncryptedPlexAuthToken(plainToken: string, encryptionKey: string): void;
  getDecryptedPlexAuthToken(encryptionKey: string): string | null;
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

mobileAuthCodeSchema.methods.setEncryptedPlexAuthToken = function (
  plainToken: string,
  encryptionKey: string
): void {
  this.plexAuthToken = encryptUserData(plainToken, encryptionKey);
};

mobileAuthCodeSchema.methods.getDecryptedPlexAuthToken = function (
  encryptionKey: string
): string | null {
  if (!this.plexAuthToken) return null;
  return decryptUserData(this.plexAuthToken, encryptionKey);
};

export const MobileAuthCode: Model<IMobileAuthCode> =
  mongoose.models.MobileAuthCode ||
  mongoose.model<IMobileAuthCode>('MobileAuthCode', mobileAuthCodeSchema);
