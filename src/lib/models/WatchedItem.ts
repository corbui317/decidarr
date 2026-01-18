import mongoose, { Document, Model, Types } from 'mongoose';

export interface IWatchedItem extends Document {
  userId: Types.ObjectId;
  plexId: string;
  mediaType: 'movie' | 'show' | 'episode';
  title: string;
  watchedAt: Date;
  markedManually: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const watchedItemSchema = new mongoose.Schema<IWatchedItem>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plexId: { type: String, required: true },
    mediaType: { type: String, enum: ['movie', 'show', 'episode'], required: true },
    title: { type: String, required: true },
    watchedAt: { type: Date, default: Date.now },
    markedManually: { type: Boolean, default: false },
  },
  { timestamps: true }
);

watchedItemSchema.index({ userId: 1, plexId: 1 }, { unique: true });
watchedItemSchema.index({ userId: 1 });

export const WatchedItem: Model<IWatchedItem> =
  mongoose.models.WatchedItem || mongoose.model<IWatchedItem>('WatchedItem', watchedItemSchema);
