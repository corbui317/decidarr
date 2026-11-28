import mongoose, { Document, Model, Types } from 'mongoose';
import type { SyncEntityType } from '@decidarr/api-contracts';

export interface IAppliedSyncMutation extends Document {
  userId: Types.ObjectId;
  mutationId: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  revision: number | null;
  /** The conflict reason, or the error code of a rejected mutation. */
  conflictReason?: string;
  resultHash: string;
  createdAt: Date;
}

const appliedSyncMutationSchema = new mongoose.Schema<IAppliedSyncMutation>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mutationId: { type: String, required: true },
    deviceId: { type: String, required: true },
    entityType: {
      type: String,
      enum: ['preference', 'watched', 'spin_history'],
      required: true,
    },
    entityId: { type: String, required: true },
    status: {
      type: String,
      enum: ['applied', 'duplicate', 'conflict', 'rejected'],
      required: true,
    },
    revision: { type: Number, default: null },
    conflictReason: { type: String },
    resultHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

appliedSyncMutationSchema.index({ userId: 1, mutationId: 1 }, { unique: true });
appliedSyncMutationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const AppliedSyncMutation: Model<IAppliedSyncMutation> =
  mongoose.models.AppliedSyncMutation ||
  mongoose.model<IAppliedSyncMutation>('AppliedSyncMutation', appliedSyncMutationSchema);
