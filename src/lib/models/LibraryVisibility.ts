import mongoose, { Document, Model, Types } from 'mongoose';

/**
 * The items one user may see in one library of one Plex server: the item keys Plex
 * listed for that user's own server token at their last sync.
 */
export interface ILibraryVisibility extends Document {
  userId: Types.ObjectId;
  plexMachineId: string;
  libraryId: string;
  plexIds: string[];
  lastSyncedAt: Date;
  expiresAt: Date;
}

const libraryVisibilitySchema = new mongoose.Schema<ILibraryVisibility>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plexMachineId: { type: String, required: true },
    libraryId: { type: String, required: true },
    plexIds: { type: [String], default: [] },
    lastSyncedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

libraryVisibilitySchema.index({ userId: 1, plexMachineId: 1, libraryId: 1 }, { unique: true });
libraryVisibilitySchema.index({ plexMachineId: 1, libraryId: 1 });
libraryVisibilitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const LibraryVisibility: Model<ILibraryVisibility> =
  mongoose.models.LibraryVisibility ||
  mongoose.model<ILibraryVisibility>('LibraryVisibility', libraryVisibilitySchema);
