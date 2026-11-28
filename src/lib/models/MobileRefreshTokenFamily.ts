import mongoose, { Document, Model } from 'mongoose';

/**
 * One marker per refresh-token family, set once reuse is detected (a replay of an
 * already-rotated token, or two concurrent presentations racing the same rotation).
 * Kept separate from MobileRefreshToken.revokedAt, which every ordinary rotation also
 * sets on its predecessor: a dedicated, append-only marker lets any token in the
 * family - including one minted after the detection but before it could be revoked
 * directly - be refused on its own next use, without needing a transaction to make a
 * single rotation's revoke-old/create-new swap atomic with every concurrent sibling.
 */
export interface IMobileRefreshTokenFamily extends Document {
  tokenFamily: string;
  compromisedAt: Date;
}

const mobileRefreshTokenFamilySchema = new mongoose.Schema<IMobileRefreshTokenFamily>({
  tokenFamily: { type: String, required: true, unique: true },
  compromisedAt: { type: Date, required: true },
});

export const MobileRefreshTokenFamily: Model<IMobileRefreshTokenFamily> =
  mongoose.models.MobileRefreshTokenFamily ||
  mongoose.model<IMobileRefreshTokenFamily>('MobileRefreshTokenFamily', mobileRefreshTokenFamilySchema);
