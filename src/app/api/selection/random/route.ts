import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { createPlexService } from '@/lib/services/plex-factory';
import { TMDbService } from '@/lib/services/tmdb';
import { createLogger } from '@/lib/logger';
import { applyFullFilters, fetchCollectionItemIds } from '@/lib/selection/filters';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';
import { selectionRequestBody } from '@/lib/validation/selection-contract';
import type { SelectionResultResponse } from '@/types/api/selection';
import type { SelectionError } from '@/types/shared';

const logger = createLogger('API:Random');

export const POST = route({ access: 'user', body: selectionRequestBody }, async ({ session, body }) => {
  const { libraryIds, mediaType, filters, tvSelectionMode } = body;

  if (libraryIds.length === 0) {
    return NextResponse.json(
      { error: 'At least one library must be selected', code: 'NO_LIBRARIES' },
      { status: 400 }
    );
  }

  const settings = await getOrCreateSettings();
  const allowedLibraryIds = await getAccessibleLibraryIds(
    {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    },
    libraryIds
  );
  if (allowedLibraryIds.length === 0) {
    return NextResponse.json(
      { error: 'No accessible libraries selected', code: 'NO_ACCESSIBLE_LIBRARIES' },
      { status: 403 }
    );
  }

  const machineId = settings.plexMachineId;
  if (!machineId) {
    return NextResponse.json(
      { error: 'Plex machine ID not configured', code: 'MACHINE_ID_MISSING' },
      { status: 400 }
    );
  }

  const caches = await LibraryCache.find({
    plexMachineId: machineId,
    libraryId: { $in: allowedLibraryIds },
    mediaType,
  }).lean();

  let allItems = caches.flatMap((cache) => cache.items);

  if (allItems.length === 0) {
    const errorResponse: SelectionError = {
      error: 'No items found in selected libraries',
      code: 'NO_ITEMS_IN_LIBRARIES',
      suggestion: 'Try syncing your libraries first',
    };
    return NextResponse.json(errorResponse, { status: 404 });
  }

  const plexService = await createPlexService(session.plex.token, session.plex.serverUrl, settings.plexMachineId);

  let collectionItemIds: Set<string> | null = null;
  if (filters.collections && filters.collections.length > 0) {
    collectionItemIds = await fetchCollectionItemIds(filters.collections, plexService, logger);
    logger.debug('Filtered by collections', {
      before: caches.flatMap((c) => c.items).length,
      collectionItemCount: collectionItemIds.size,
    });
  }

  let watchedIds = new Set<string>();
  if (filters.unwatchedOnly) {
    const watchedItems = await WatchedItem.find({ userId: session.userId }).select('plexId').lean();
    watchedIds = new Set(watchedItems.map((w) => w.plexId));
  }

  allItems = applyFullFilters(allItems, filters, watchedIds, collectionItemIds, settings.overseerrFilterEnabled);

  if (allItems.length === 0) {
    const errorResponse: SelectionError = {
      error: 'No items match your filters',
      code: 'NO_ITEMS_MATCH_FILTERS',
      suggestion: 'Try adjusting your filters',
    };
    return NextResponse.json(errorResponse, { status: 404 });
  }

  const randomIndex = Math.floor(Math.random() * allItems.length);
  const selectedItem = allItems[randomIndex];

  const fullDetails = await plexService.getItemMetadata(selectedItem.plexId);
  const playLinks = plexService.buildPlayLinks(selectedItem.plexId);

  let tmdbData = null;
  const tmdbApiKey = settings.getDecryptedTmdbKey();
  if (tmdbApiKey) {
    const tmdbService = new TMDbService(tmdbApiKey);
    tmdbData = await tmdbService.matchPlexItem(fullDetails.title, fullDetails.year, mediaType);
  }

  const selectionWithTmdb: SelectionResultResponse['selection'] = {
    ...sanitizeLibraryItemForClient({
      ...fullDetails,
      type: fullDetails.type ?? mediaType,
      overseerrStatus: selectedItem.overseerrStatus ?? null,
    }),
    tmdb: tmdbData,
  };

  const response: SelectionResultResponse = {
    selection: selectionWithTmdb,
    playLinks,
    stats: {
      totalMatches: allItems.length,
    },
    tvSelectionMode,
  };
  return NextResponse.json(response);
});
