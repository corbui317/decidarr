import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { WatchedItem } from '@/lib/models/WatchedItem';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const watchedListQuery = z.object({
  mediaType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = route({ access: 'user', query: watchedListQuery }, async ({ session, query }) => {
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

  return NextResponse.json({
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});
