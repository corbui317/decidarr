import mongoose, { Document, Model, Types } from 'mongoose';
import type { SyncEntityType } from '@decidarr/api-contracts';

export interface ISyncEntityRevision extends Document {
  userId: Types.ObjectId;
  entityType: SyncEntityType;
  entityId: string;
  revision: number;
  deletedAt?: Date;
  updatedAt: Date;
}

const syncEntityRevisionSchema = new mongoose.Schema<ISyncEntityRevision>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    entityType: {
      type: String,
      enum: ['preference', 'watched', 'spin_history'],
      required: true,
    },
    entityId: { type: String, required: true },
    revision: { type: Number, required: true, default: 1 },
    deletedAt: { type: Date },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

syncEntityRevisionSchema.index({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });

export const SyncEntityRevision: Model<ISyncEntityRevision> =
  mongoose.models.SyncEntityRevision ||
  mongoose.model<ISyncEntityRevision>('SyncEntityRevision', syncEntityRevisionSchema);
