import { route } from '@/lib/request/route';
import {
  spinHistoryClearAllResponseSchema,
  spinHistoryCreateBodySchema,
  spinHistoryCreateResponseSchema,
  spinHistoryListQuerySchema,
  spinHistoryListResponseSchema,
} from '@decidarr/api-contracts';
import type { Document, Types } from 'mongoose';
import { SpinHistoryEntry, type ISpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { resolveItemImageUrls } from '@/lib/plex-image';
import { clearSpinHistory, recordSpin } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

/** An entry as a document or as a lean query result. */
type StoredEntry = ISpinHistoryEntry | (Omit<ISpinHistoryEntry, keyof Document> & { _id: Types.ObjectId });

/** A stored entry as its contract declares it, with proxied image URLs; storage internals stay behind. */
function toEntryResponse(entry: StoredEntry) {
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

export const GET = route(
  { access: 'user', query: spinHistoryListQuerySchema, response: spinHistoryListResponseSchema },
  async ({ session, query, reply }) => {
    const { page, limit } = query;
    const filter = { userId: session.userId };
    const [items, total] = await Promise.all([
      SpinHistoryEntry.find(filter)
        .sort({ spunAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SpinHistoryEntry.countDocuments(filter),
    ]);

    return reply({ items: items.map(toEntryResponse), total, page, pageSize: limit });
  }
);

export const POST = route(
  { access: 'user', body: spinHistoryCreateBodySchema, response: spinHistoryCreateResponseSchema },
  async ({ session, body, reply }) => {
    const { entry } = await recordSpin(session, body);
    if (!entry) {
      return reply({ skipped: true, reason: 'disabled' });
    }
    return reply({ entry: toEntryResponse(entry) }, 201);
  }
);

export const DELETE = route({ access: 'user', response: spinHistoryClearAllResponseSchema }, async ({ session, reply }) => {
  return reply({ deleted: await clearSpinHistory(session) });
});
