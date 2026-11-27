import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { spinHistoryCreateBodySchema, spinHistoryListQuerySchema } from '@decidarr/api-contracts';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import {
  getSpinHistoryPreferences,
  sanitizeFilterSnapshot,
  trimSpinHistoryToRetention,
} from '@/lib/spin-history';
import { resolveItemImageUrls, sanitizeThumbPathInput } from '@/lib/plex-image';
import { emitSyncChange, toSpinHistoryContract } from '@/lib/sync/service';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

function withImageUrls<T extends { thumbPath?: string | null; posterUrl?: string | null }>(item: T) {
  const images = resolveItemImageUrls(item);
  return {
    ...item,
    thumbPath: item.thumbPath || images.thumbPath,
    posterUrl: images.posterUrl || undefined,
  };
}

export const GET = route({ access: 'user', query: spinHistoryListQuerySchema }, async ({ session, query }) => {
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

  return NextResponse.json({ items: items.map(withImageUrls), total, page, pageSize: limit });
});

export const POST = route({ access: 'user', body: spinHistoryCreateBodySchema }, async ({ session, body }) => {
  const prefs = await getSpinHistoryPreferences(session.userId);
  if (!prefs.enabled) {
    return NextResponse.json({ skipped: true, reason: 'disabled' });
  }

  const entry = await SpinHistoryEntry.create({
    userId: session.userId,
    plexId: body.plexId,
    title: body.title,
    mediaType: body.mediaType,
    thumbPath: sanitizeThumbPathInput(body.thumbPath),
    year: body.year ?? undefined,
    libraryIds: body.libraryIds,
    filtersSnapshot:
      prefs.storeFilterSnapshot && body.filtersSnapshot
        ? sanitizeFilterSnapshot(body.filtersSnapshot)
        : undefined,
    tvSelectionMode: body.tvSelectionMode ?? undefined,
    poolSizeAtSpin: body.poolSizeAtSpin ?? undefined,
    spunAt: new Date(),
  });

  await trimSpinHistoryToRetention(session.userId, prefs.retentionLimit);
  await emitSyncChange(
    session.userId,
    'spin_history',
    entry._id.toString(),
    'upsert',
    toSpinHistoryContract(entry)
  );

  return NextResponse.json({ entry: withImageUrls(entry.toObject()) }, { status: 201 });
});

export const DELETE = route({ access: 'user' }, async ({ session }) => {
  const result = await SpinHistoryEntry.deleteMany({ userId: session.userId });
  return NextResponse.json({ deleted: result.deletedCount ?? 0 });
});
