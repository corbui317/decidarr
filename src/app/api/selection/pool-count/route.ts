import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds, getOverseerrConfig } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { itemsFor } from '@/lib/library/store';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { computeDataStats, getPoolCountWithBreakdown, fetchCollectionItemIds } from '@/lib/selection/filters';
import { selectionRequestBodySchema, EMPTY_DATA_STATS } from '@decidarr/api-contracts';

const logger = createLogger('API:PoolCount');

export const POST = route({ access: 'user', body: selectionRequestBodySchema }, async ({ session, body }) => {
  const { libraryIds, mediaType, filters } = body;

  if (!libraryIds || libraryIds.length === 0) {
    return NextResponse.json({
      totalItems: 0,
      matchingItems: 0,
      filterBreakdown: [],
      emptyReason: 'No libraries selected',
      dataStats: EMPTY_DATA_STATS,
    });
  }

  const settings = await getOrCreateSettings();
  const access = {
    userId: session.userId.toString(),
    plexToken: session.plex.token,
    plexServerUrl: session.plex.serverUrl,
    plexMachineId: settings.plexMachineId || null,
  };
  const allowedLibraryIds = await getAccessibleLibraryIds(access, libraryIds);

  if (!settings.plexMachineId) {
    return NextResponse.json({
      totalItems: 0,
      matchingItems: 0,
      filterBreakdown: [],
      emptyReason: 'Plex machine ID not configured',
      dataStats: EMPTY_DATA_STATS,
    });
  }

  const overseerrConfig = await getOverseerrConfig();

  const { items: allItems } = await itemsFor(access, { libraryIds: allowedLibraryIds, mediaType });

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
    const watchedItems = await WatchedItem.find({ userId: session.userId }).select('plexId').lean();
    watchedIds = new Set(watchedItems.map((w) => w.plexId));
  }

  let collectionItemIds: Set<string> | null = null;
  if (filters.collections && filters.collections.length > 0) {
    const plexService = new PlexService(session.plex.token, session.plex.serverUrl, settings.plexMachineId);
    collectionItemIds = await fetchCollectionItemIds(filters.collections, plexService, logger);
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
    overseerrConfig.configured && settings.overseerrFilterEnabled && !overseerrConfig.lastSyncOk
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
});
