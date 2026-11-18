import mongoose, { Document, Model, Types } from 'mongoose';

export interface IMobileRefreshToken extends Document {
  userId: Types.ObjectId;
  deviceId: string;
  deviceName?: string;
  tokenHash: string;
  tokenFamily: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const mobileRefreshTokenSchema = new mongoose.Schema<IMobileRefreshToken>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String },
    tokenHash: { type: String, required: true, unique: true },
    tokenFamily: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    lastUsedAt: { type: Date },
  },
  { timestamps: true }
);

mobileRefreshTokenSchema.index({ userId: 1, deviceId: 1 });
mobileRefreshTokenSchema.index({ tokenFamily: 1 });

export const MobileRefreshToken: Model<IMobileRefreshToken> =
  mongoose.models.MobileRefreshToken ||
  mongoose.model<IMobileRefreshToken>('MobileRefreshToken', mobileRefreshTokenSchema);
