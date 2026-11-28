import { watchedListQuerySchema, watchedListResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { toWatchedContract } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route(
  { access: 'user', query: watchedListQuerySchema, response: watchedListResponseSchema },
  async ({ session, query, reply }) => {
    const { mediaType, page, limit } = query;

    const filter: Record<string, unknown> = { userId: session.userId };
    if (mediaType) {
      filter.mediaType = mediaType;
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      WatchedItem.find(filter).sort({ watchedAt: -1 }).skip(skip).limit(limit).lean(),
      WatchedItem.countDocuments(filter),
    ]);

    return reply({
      items: items.map(toWatchedContract),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  }
);
