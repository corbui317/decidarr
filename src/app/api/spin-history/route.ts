import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { spinHistoryCreateBodySchema, spinHistoryListQuerySchema } from '@decidarr/api-contracts';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { resolveItemImageUrls } from '@/lib/plex-image';
import { clearSpinHistory, recordSpin } from '@/lib/user-data';

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
  const { entry } = await recordSpin(session, body);
  if (!entry) {
    return NextResponse.json({ skipped: true, reason: 'disabled' });
  }
  return NextResponse.json({ entry: withImageUrls(entry.toObject()) }, { status: 201 });
});

export const DELETE = route({ access: 'user' }, async ({ session }) => {
  return NextResponse.json({ deleted: await clearSpinHistory(session) });
});
