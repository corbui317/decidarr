import { NextRequest, NextResponse } from 'next/server';
import {
  requireUser,
  getAccessibleLibraryIds,
  isAuthError,
  authErrorStatus,
  getOverseerrConfig,
} from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { computeDataStats, getPoolCountWithBreakdown, fetchCollectionItemIds } from '@/lib/selection/filters';
import { parseSelectionRequestBody } from '@/lib/validation/selection';
import { EMPTY_DATA_STATS } from '@decidarr/api-contracts';

const logger = createLogger('API:PoolCount');

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    const { plexToken, plexServerUrl, settings, user } = auth;
    const parsed = parseSelectionRequestBody(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { libraryIds, mediaType, filters } = parsed.data;

    if (!libraryIds || libraryIds.length === 0) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'No libraries selected',
        dataStats: EMPTY_DATA_STATS,
      });
    }

    await connectDB();

    const allowedLibraryIds = await getAccessibleLibraryIds(auth, libraryIds);

    const machineId = settings.plexMachineId;
    if (!machineId) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'Plex machine ID not configured',
        dataStats: EMPTY_DATA_STATS,
      });
    }

    const overseerrConfig = await getOverseerrConfig();

    const caches = await LibraryCache.find({
      plexMachineId: machineId,
      libraryId: { $in: allowedLibraryIds },
      mediaType,
    }).lean();

    const allItems = caches.flatMap((cache) => cache.items);

    if (allItems.length === 0) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'No items found in selected libraries. Try syncing your libraries first.',
        dataStats: EMPTY_DATA_STATS,
      });
    }

    const dataStats = computeDataStats(allItems);

    let watchedIds = new Set<string>();
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: user._id }).select('plexId').lean();
      watchedIds = new Set(watchedItems.map((w) => w.plexId));
    }

    let collectionItemIds: Set<string> | null = null;
    if (filters.collections && filters.collections.length > 0) {
      const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);
      collectionItemIds = await fetchCollectionItemIds(
        filters.collections,
        plexService,
        logger
      );
      logger.debug('Collection filter active', {
        collectionCount: filters.collections.length,
        itemCount: collectionItemIds.size,
      });
    }

    const result = getPoolCountWithBreakdown(
      allItems,
      filters,
      watchedIds,
      dataStats,
      collectionItemIds,
      settings.overseerrFilterEnabled
    );

    const overseerrWarning =
      overseerrConfig.configured &&
      settings.overseerrFilterEnabled &&
      !overseerrConfig.lastSyncOk
        ? 'Overseerr is unavailable. Using the last cached availability data.'
        : null;

    return NextResponse.json({
      totalItems: allItems.length,
      matchingItems: result.matchingCount,
      filterBreakdown: result.breakdown,
      emptyReason: result.emptyReason,
      dataStats,
      overseerrWarning,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Pool count error', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to get pool count' }, { status: 500 });
  }
}
