import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import mongoose from 'mongoose';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:PoolCount');
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

import type { Filters } from '@/types/filters';
import { computeDataStats, getPoolCountWithBreakdown } from '@/lib/selection/filters';

export async function POST(request: NextRequest) {
  try {
    const { plexToken, plexServerUrl, settings } = await requireAuth();
    const { libraryIds, mediaType, filters = {} } = await request.json();

    if (!libraryIds || libraryIds.length === 0) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'No libraries selected',
        dataStats: {
          itemsWithRating: 0,
          itemsWithContentRating: 0,
          itemsWithStudio: 0,
          itemsWithYear: 0,
          itemsWithGenres: 0,
        },
      });
    }

    await connectDB();

    // Get cached items from selected libraries
    const caches = await LibraryCache.find({
      userId: SINGLE_USER_ID,
      libraryId: { $in: libraryIds },
      mediaType: mediaType || 'movie',
    }).lean();

    const allItems = caches.flatMap((cache) => cache.items);

    if (allItems.length === 0) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'No items found in selected libraries. Try syncing your libraries first.',
        dataStats: {
          itemsWithRating: 0,
          itemsWithContentRating: 0,
          itemsWithStudio: 0,
          itemsWithYear: 0,
          itemsWithGenres: 0,
        },
      });
    }

    // Calculate data availability stats
    const dataStats = computeDataStats(allItems);

    // Get watched items for unwatched filter
    let watchedIds = new Set<string>();
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: SINGLE_USER_ID }).lean();
      watchedIds = new Set(watchedItems.map((w) => w.plexId));
    }

    // Get collection item IDs if collections filter is active
    let collectionItemIds: Set<string> | null = null;
    if (filters.collections && filters.collections.length > 0) {
      collectionItemIds = new Set<string>();
      const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);

      await Promise.all(
        (filters.collections as string[]).map(async (collectionKey: string) => {
          try {
            const items = await plexService.getCollectionItems(collectionKey);
            for (const item of items) {
              collectionItemIds!.add(item.plexId);
            }
          } catch (err) {
            logger.warn('Failed to fetch collection items', { collectionKey, error: (err as Error).message });
          }
        })
      );
      logger.debug('Collection filter active', { collectionCount: filters.collections.length, itemCount: collectionItemIds.size });
    }

    // Apply filters and track breakdown
    const result = getPoolCountWithBreakdown(allItems, filters as Filters, watchedIds, dataStats, collectionItemIds);

    return NextResponse.json({
      totalItems: allItems.length,
      matchingItems: result.matchingCount,
      filterBreakdown: result.breakdown,
      emptyReason: result.emptyReason,
      dataStats,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Pool count error:', error);
    return NextResponse.json({ error: 'Failed to get pool count' }, { status: 500 });
  }
}

