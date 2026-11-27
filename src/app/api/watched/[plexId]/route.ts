import { NextResponse } from 'next/server';
import {
  watchedCreateBodySchema,
  watchedPlexIdParamsSchema,
  type WatchedStatusResponse,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';
import type { WatchedMediaType } from '@/lib/validation/watched';
import { emitSyncChange, toWatchedContract } from '@/lib/sync/service';

export const GET = route({ access: 'user', params: watchedPlexIdParamsSchema }, async ({ session, params }) => {
  const item = await WatchedItem.findOne({
    userId: session.userId,
    plexId: params.plexId,
  }).lean();

  const response: WatchedStatusResponse = { watched: !!item };
  return NextResponse.json(response);
});

export const POST = route(
  { access: 'admin', params: watchedPlexIdParamsSchema, body: watchedCreateBodySchema },
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

export const DELETE = route({ access: 'admin', params: watchedPlexIdParamsSchema }, async ({ session, params }) => {
  await WatchedItem.deleteOne({ userId: session.userId, plexId: params.plexId });

  await emitSyncChange(session.userId, 'watched', params.plexId, 'delete', null);

  return NextResponse.json({ message: 'Marked as unwatched' });
});
