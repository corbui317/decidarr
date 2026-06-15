import mongoose, { Document, Model } from 'mongoose';
import type { OverseerrAvailability } from '@/types/overseerr';

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
  tmdbRating?: number;
  networks?: string[];
  studios?: string[];
  enrichedAt?: Date;
  overseerrStatus?: OverseerrAvailability;
  overseerrSyncedAt?: Date;
}

export interface ILibraryCache extends Document {
  plexMachineId: string;
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
    tmdbRating: Number,
    networks: [String],
    studios: [String],
    enrichedAt: Date,
    overseerrStatus: { type: String, enum: ['available', 'partially_available'] },
    overseerrSyncedAt: Date,
  },
  { _id: false }
);

const libraryCacheSchema = new mongoose.Schema<ILibraryCache>(
  {
    plexMachineId: { type: String, required: true },
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

libraryCacheSchema.index({ plexMachineId: 1, libraryId: 1 }, { unique: true });
libraryCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

libraryCacheSchema.methods.isExpired = function (): boolean {
  return new Date() > this.expiresAt;
};

export const LibraryCache: Model<ILibraryCache> =
  mongoose.models.LibraryCache || mongoose.model<ILibraryCache>('LibraryCache', libraryCacheSchema);
