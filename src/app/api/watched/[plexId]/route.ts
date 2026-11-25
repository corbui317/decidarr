import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';
import type { WatchedMediaType } from '@/lib/validation/watched';
import { emitSyncChange, toWatchedContract } from '@/lib/sync/service';

const plexIdParams = z.object({ plexId: z.string().min(1) });
const watchedCreateBody = z.object({
  mediaType: z.enum(['movie', 'show', 'episode']),
  title: z.string().trim().min(1),
});

export const GET = route({ access: 'user', params: plexIdParams }, async ({ session, params }) => {
  const item = await WatchedItem.findOne({
    userId: session.userId,
    plexId: params.plexId,
  }).lean();

  return NextResponse.json({ watched: !!item });
});

export const POST = route(
  { access: 'admin', params: plexIdParams, body: watchedCreateBody },
  async ({ session, params, body }) => {
    const { mediaType, title } = body as { mediaType: WatchedMediaType; title: string };

    const item = await WatchedItem.findOneAndUpdate(
      { userId: session.userId, plexId: params.plexId },
      {
        mediaType,
        title,
        watchedAt: new Date(),
        markedManually: true,
        source: 'manual',
      },
      { upsert: true, new: true }
    );

    await emitSyncChange(session.userId, 'watched', params.plexId, 'upsert', toWatchedContract(item));

    return NextResponse.json({ item });
  }
);

export const DELETE = route({ access: 'admin', params: plexIdParams }, async ({ session, params }) => {
  await WatchedItem.deleteOne({ userId: session.userId, plexId: params.plexId });

  await emitSyncChange(session.userId, 'watched', params.plexId, 'delete', null);

  return NextResponse.json({ message: 'Marked as unwatched' });
});
