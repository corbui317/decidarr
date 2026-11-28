import {
  messageResponseSchema,
  watchedCreateBodySchema,
  watchedCreateResponseSchema,
  watchedPlexIdParamsSchema,
  watchedStatusResponseSchema,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { markWatched, toWatchedContract, unmarkWatched } from '@/lib/user-data';

export const GET = route(
  { access: 'user', params: watchedPlexIdParamsSchema, response: watchedStatusResponseSchema },
  async ({ session, params, reply }) => {
    const item = await WatchedItem.findOne({
      userId: session.userId,
      plexId: params.plexId,
    }).lean();

    return reply({ watched: !!item });
  }
);

// Any user may call these; the user-data store refuses a Friend, the same way for REST and sync.
export const POST = route(
  {
    access: 'user',
    params: watchedPlexIdParamsSchema,
    body: watchedCreateBodySchema,
    response: watchedCreateResponseSchema,
  },
  async ({ session, params, body, reply }) => {
    const { item } = await markWatched(session, params.plexId, body);
    return reply({ item: toWatchedContract(item) });
  }
);

export const DELETE = route(
  { access: 'user', params: watchedPlexIdParamsSchema, response: messageResponseSchema },
  async ({ session, params, reply }) => {
    await unmarkWatched(session, params.plexId);
    return reply({ message: 'Marked as unwatched' });
  }
);
