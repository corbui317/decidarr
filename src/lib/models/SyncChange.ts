import mongoose, { Document, Model, Types } from 'mongoose';
import type { SyncEntityType } from '@decidarr/api-contracts';

export interface ISyncChange extends Document {
  userId: Types.ObjectId;
  cursor: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  revision: number;
  changedAt: Date;
  data: unknown;
  createdAt: Date;
}

const syncChangeSchema = new mongoose.Schema<ISyncChange>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cursor: { type: String, required: true, unique: true },
    entityType: {
      type: String,
      enum: ['preference', 'watched', 'spin_history'],
      required: true,
    },
    entityId: { type: String, required: true },
    operation: { type: String, enum: ['upsert', 'delete'], required: true },
    revision: { type: Number, required: true },
    changedAt: { type: Date, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

syncChangeSchema.index({ userId: 1, cursor: 1 });
syncChangeSchema.index({ userId: 1, changedAt: 1 });

export const SyncChange: Model<ISyncChange> =
  mongoose.models.SyncChange || mongoose.model<ISyncChange>('SyncChange', syncChangeSchema);
