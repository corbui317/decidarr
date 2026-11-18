import mongoose, { Document, Model, Types } from 'mongoose';

export interface IMobileAuthCode extends Document {
  deviceCode: string;
  deviceId: string;
  deviceName?: string;
  pinId: number;
  pinCode: string;
  userId?: Types.ObjectId;
  plexAuthToken?: string;
  expiresAt: Date;
  exchangedAt?: Date;
  createdAt: Date;
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

export const MobileAuthCode: Model<IMobileAuthCode> =
  mongoose.models.MobileAuthCode ||
  mongoose.model<IMobileAuthCode>('MobileAuthCode', mobileAuthCodeSchema);
