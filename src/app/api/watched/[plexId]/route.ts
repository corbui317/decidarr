import { NextResponse } from 'next/server';
import {
  watchedCreateBodySchema,
  watchedPlexIdParamsSchema,
  type WatchedStatusResponse,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { markWatched, unmarkWatched } from '@/lib/user-data';

export const GET = route({ access: 'user', params: watchedPlexIdParamsSchema }, async ({ session, params }) => {
  const item = await WatchedItem.findOne({
    userId: session.userId,
    plexId: params.plexId,
  }).lean();

  const response: WatchedStatusResponse = { watched: !!item };
  return NextResponse.json(response);
});

// Any user may call these; the user-data store refuses a Friend, the same way for REST and sync.
export const POST = route(
  { access: 'user', params: watchedPlexIdParamsSchema, body: watchedCreateBodySchema },
  async ({ session, params, body }) => {
    const { item } = await markWatched(session, params.plexId, body);
    return NextResponse.json({ item });
  }
);

export const DELETE = route({ access: 'user', params: watchedPlexIdParamsSchema }, async ({ session, params }) => {
  await unmarkWatched(session, params.plexId);
  return NextResponse.json({ message: 'Marked as unwatched' });
});
