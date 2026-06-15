import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getTmdbApiKey } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { createLogger } from '@/lib/logger';
import mongoose from 'mongoose';

const logger = createLogger('API:Random');
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

import type { Filters } from '@/types/filters';
import { applyFullFilters } from '@/lib/selection/filters';

export async function POST(request: NextRequest) {
  try {
    const { plexToken, plexServerUrl, settings } = await requireAuth();
    const { libraryIds, mediaType, filters = {}, tvSelectionMode } = await request.json();

    if (!libraryIds || libraryIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one library must be selected' },
        { status: 400 }
      );
    }

    await connectDB();

    // Get cached items from selected libraries
    const caches = await LibraryCache.find({
      userId: SINGLE_USER_ID,
      libraryId: { $in: libraryIds },
      mediaType: mediaType || 'movie',
    }).lean();

    let allItems = caches.flatMap((cache) => cache.items);

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: 'No items found in selected libraries', suggestion: 'Try syncing your libraries first' },
        { status: 404 }
      );
    }

    // Get Plex service for collections and play links
    const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);

    // If machineId is missing, try to fetch and store it now
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
      logger.debug('Filtered by collections', {
        before: caches.flatMap((c) => c.items).length,
        collectionItemCount: collectionItemIds.size,
      });
    }

    let watchedIds = new Set<string>();
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: SINGLE_USER_ID }).lean();
      watchedIds = new Set(watchedItems.map((w) => w.plexId));
    }

    allItems = applyFullFilters(allItems, filters as Filters, watchedIds, collectionItemIds);

    if (allItems.length === 0) {
      return NextResponse.json(
        { error: 'No items match your filters', suggestion: 'Try adjusting your filters' },
        { status: 404 }
      );
    }

    // Pick random item
    const randomIndex = Math.floor(Math.random() * allItems.length);
    const selectedItem = allItems[randomIndex];

    // Get full details from Plex
    const fullDetails = await plexService.getItemMetadata(selectedItem.plexId);

    // Build play links
    const playLinks = plexService.buildPlayLinks(selectedItem.plexId);

    // Enrich with TMDb data if available
    let tmdbData = null;
    const tmdbApiKey = await getTmdbApiKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      tmdbData = await tmdbService.matchPlexItem(
        fullDetails.title,
        fullDetails.year,
        mediaType as 'movie' | 'show'
      );
    }

    return NextResponse.json({
      selection: {
        ...fullDetails,
        tmdb: tmdbData,
      },
      playLinks,
      stats: {
        totalMatches: allItems.length,
      },
      tvSelectionMode,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Random selection error:', error);
    return NextResponse.json({ error: 'Failed to get random selection' }, { status: 500 });
  }
}

