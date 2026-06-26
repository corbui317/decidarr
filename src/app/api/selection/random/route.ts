import { NextRequest, NextResponse } from 'next/server';
import {
  requireUser,
  getTmdbApiKey,
  getAccessibleLibraryIds,
  isAuthError,
  authErrorStatus,
} from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { createLogger } from '@/lib/logger';
import { applyFullFilters } from '@/lib/selection/filters';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';
import { parseSelectionRequestBody } from '@/lib/validation/selection';

const logger = createLogger('API:Random');

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    const parsed = parseSelectionRequestBody(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { libraryIds, mediaType, filters, tvSelectionMode } = parsed.data;

    if (libraryIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one library must be selected' },
        { status: 400 }
      );
    }

    await connectDB();

    const { settings, plexToken, plexServerUrl, user } = auth;
    const allowedLibraryIds = await getAccessibleLibraryIds(auth, libraryIds);
    if (allowedLibraryIds.length === 0) {
      return NextResponse.json({ error: 'No accessible libraries selected' }, { status: 403 });
    }

    const machineId = settings.plexMachineId;
    if (!machineId) {
      return NextResponse.json({ error: 'Plex machine ID not configured' }, { status: 400 });
    }

    const caches = await LibraryCache.find({
      plexMachineId: machineId,
      libraryId: { $in: allowedLibraryIds },
      mediaType,
    }).lean();

    let allItems = caches.flatMap((cache) => cache.items);

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: 'No items found in selected libraries', suggestion: 'Try syncing your libraries first' },
        { status: 404 }
      );
    }

    const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);

    if (!settings.plexMachineId) {
      logger.info('MachineId missing, fetching from server');
      const fetchedMachineId = await plexService.fetchMachineIdFromServer();
      if (fetchedMachineId) {
        settings.plexMachineId = fetchedMachineId;
        await settings.save();
        logger.info('Stored machineId', { machineId: fetchedMachineId });
      }
    }

    let collectionItemIds: Set<string> | null = null;
    if (filters.collections && filters.collections.length > 0) {
      collectionItemIds = new Set<string>();
      await Promise.all(
        filters.collections.map(async (collectionKey: string) => {
          try {
            const items = await plexService.getCollectionItems(collectionKey);
            for (const item of items) {
              collectionItemIds!.add(item.plexId);
            }
          } catch (err) {
            logger.warn('Failed to fetch collection items', {
              collectionKey,
              error: (err as Error).message,
            });
          }
        })
      );
      logger.debug('Filtered by collections', {
        before: caches.flatMap((c) => c.items).length,
        collectionItemCount: collectionItemIds.size,
      });
    }

    let watchedIds = new Set<string>();
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: user._id }).lean();
      watchedIds = new Set(watchedItems.map((w) => w.plexId));
    }

    allItems = applyFullFilters(
      allItems,
      filters,
      watchedIds,
      collectionItemIds,
      settings.overseerrFilterEnabled
    );

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: 'No items match your filters', suggestion: 'Try adjusting your filters' },
        { status: 404 }
      );
    }

    const randomIndex = Math.floor(Math.random() * allItems.length);
    const selectedItem = allItems[randomIndex];

    const fullDetails = await plexService.getItemMetadata(selectedItem.plexId);
    const playLinks = plexService.buildPlayLinks(selectedItem.plexId);

    let tmdbData = null;
    const tmdbApiKey = await getTmdbApiKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      tmdbData = await tmdbService.matchPlexItem(
        fullDetails.title,
        fullDetails.year,
        mediaType
      );
    }

    return NextResponse.json({
      selection: sanitizeLibraryItemForClient({
        ...fullDetails,
        tmdb: tmdbData,
        overseerrStatus: selectedItem.overseerrStatus ?? null,
      } as Record<string, unknown>),
      playLinks,
      stats: {
        totalMatches: allItems.length,
      },
      tvSelectionMode,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Random selection error:', error);
    return NextResponse.json({ error: 'Failed to get random selection' }, { status: 500 });
  }
}
