import type { Document, Types } from 'mongoose';
import type { SpinHistoryEntryResponse } from '@decidarr/api-contracts';
import type { ISpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { resolveItemImageUrls } from '@/lib/plex-image';
import type { Json } from '@/lib/request/reply';

/** An entry as a document or as a lean query result. */
type StoredEntry = ISpinHistoryEntry | (Omit<ISpinHistoryEntry, keyof Document> & { _id: Types.ObjectId });

/** A stored entry as its contract declares it, with proxied image URLs; storage internals stay behind. */
export function toSpinHistoryEntryResponse(entry: StoredEntry): Json<SpinHistoryEntryResponse> {
  const images = resolveItemImageUrls(entry);
  return {
    _id: entry._id,
    userId: entry.userId,
    plexId: entry.plexId,
    title: entry.title,
    mediaType: entry.mediaType,
    posterUrl: images.posterUrl || undefined,
    thumbPath: entry.thumbPath || images.thumbPath,
    year: entry.year,
    libraryIds: entry.libraryIds,
    filtersSnapshot: entry.filtersSnapshot,
    tvSelectionMode: entry.tvSelectionMode,
    poolSizeAtSpin: entry.poolSizeAtSpin,
    spunAt: entry.spunAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
