import mongoose, { Document, Model, Types } from 'mongoose';

export interface ILibraryItem {
  plexId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  genres?: string[];
  summary?: string;
  rating?: number;
  duration?: number;
  tmdbId?: string;
  awards?: string[];
  seasonCount?: number;
  episodeCount?: number;
  contentRating?: string;
  studio?: string;
  addedAt?: Date;
  type?: string;
  // TMDb enrichment fields
  tmdbRating?: number;
  networks?: string[];
  studios?: string[];
  enrichedAt?: Date;
}

export interface ILibraryCache extends Document {
  userId: Types.ObjectId;
  libraryId: string;
  libraryName: string;
  mediaType: 'movie' | 'show';
  items: ILibraryItem[];
  lastSyncedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  isExpired(): boolean;
}

const libraryItemSchema = new mongoose.Schema<ILibraryItem>(
  {
    plexId: { type: String, required: true },
    title: { type: String, required: true },
    year: Number,
    posterUrl: String,
    genres: [String],
    summary: String,
    rating: Number,
    duration: Number,
    tmdbId: String,
    awards: [String],
    seasonCount: Number,
    episodeCount: Number,
    contentRating: String,
    studio: String,
    addedAt: Date,
    type: String,
    // TMDb enrichment fields
    tmdbRating: Number,
    networks: [String],
    studios: [String],
    enrichedAt: Date,
  },
  { _id: false }
);

const libraryCacheSchema = new mongoose.Schema<ILibraryCache>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    libraryId: { type: String, required: true },
    libraryName: { type: String, required: true },
    mediaType: { type: String, enum: ['movie', 'show'], required: true },
    items: [libraryItemSchema],
    lastSyncedAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true }
);

libraryCacheSchema.index({ userId: 1, libraryId: 1 }, { unique: true });
libraryCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

libraryCacheSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

export const LibraryCache: Model<ILibraryCache> =
  mongoose.models.LibraryCache || mongoose.model<ILibraryCache>('LibraryCache', libraryCacheSchema);
