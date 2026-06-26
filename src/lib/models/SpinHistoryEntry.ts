import mongoose, { Document, Model, Types } from 'mongoose';

export interface ISpinHistoryEntry extends Document {
  userId: Types.ObjectId;
  plexId: string;
  title: string;
  mediaType: 'movie' | 'show' | 'episode';
  /** @deprecated Use thumbPath */
  posterUrl?: string;
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Record<string, unknown>;
  tvSelectionMode?: 'show' | 'episode';
  poolSizeAtSpin?: number;
  spunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const spinHistoryEntrySchema = new mongoose.Schema<ISpinHistoryEntry>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plexId: { type: String, required: true },
    title: { type: String, required: true },
    mediaType: { type: String, enum: ['movie', 'show', 'episode'], required: true },
    posterUrl: { type: String },
    thumbPath: { type: String },
    year: { type: Number },
    libraryIds: { type: [String], default: [] },
    filtersSnapshot: { type: mongoose.Schema.Types.Mixed },
    tvSelectionMode: { type: String, enum: ['show', 'episode'] },
    poolSizeAtSpin: { type: Number },
    spunAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

spinHistoryEntrySchema.index({ userId: 1, spunAt: -1 });

export const SpinHistoryEntry: Model<ISpinHistoryEntry> =
  mongoose.models.SpinHistoryEntry ||
  mongoose.model<ISpinHistoryEntry>('SpinHistoryEntry', spinHistoryEntrySchema);
