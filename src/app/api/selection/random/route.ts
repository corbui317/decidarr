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

    // Get Plex service for collections
    const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);

    // Filter by collections if specified
    if (filters.collections && filters.collections.length > 0) {
      const collectionItemIds = new Set<string>();
      await Promise.all(
        (filters.collections as string[]).map(async (collectionKey: string) => {
          try {
            const items = await plexService.getCollectionItems(collectionKey);
            for (const item of items) {
              collectionItemIds.add(item.plexId);
            }
          } catch (err) {
            logger.warn('Failed to fetch collection items', { collectionKey, error: (err as Error).message });
          }
        })
      );
      allItems = allItems.filter((item) => collectionItemIds.has(item.plexId));
      logger.debug('Filtered by collections', { before: caches.flatMap(c => c.items).length, after: allItems.length });
    }

    // Apply filters
    allItems = applyFilters(allItems, filters as Filters);

    // Filter out watched items if requested
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: SINGLE_USER_ID }).lean();
      const watchedIds = new Set(watchedItems.map((w) => w.plexId));
      allItems = allItems.filter((item) => !watchedIds.has(item.plexId));
    }

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

function applyFilters(items: any[], filters: Filters): any[] {
  let filtered = [...items];

  // Genre filter
  if (filters.genres && filters.genres.length > 0) {
    filtered = filtered.filter(
      (item) => item.genres && item.genres.some((g: string) => filters.genres!.includes(g))
    );
  }

  // Year range filter
  if (filters.yearRange) {
    if (filters.yearRange.start) {
      filtered = filtered.filter((item) => item.year && item.year >= filters.yearRange!.start!);
    }
    if (filters.yearRange.end) {
      filtered = filtered.filter((item) => item.year && item.year <= filters.yearRange!.end!);
    }
  }

  // Content rating filter (age ratings like PG-13, R, TV-MA)
  if (filters.contentRatings && filters.contentRatings.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.contentRating) return false;
      return filters.contentRatings!.includes(item.contentRating);
    });
  }

  // Studio filter
  if (filters.studios && filters.studios.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.studio) return false;
      const itemStudio = item.studio.toLowerCase();
      return filters.studios!.some((studio) =>
        itemStudio.includes(studio.toLowerCase())
      );
    });
  }

  // Rating range filter (min/max score)
  if (filters.ratingRange) {
    if (filters.ratingRange.min !== undefined && filters.ratingRange.min !== null) {
      filtered = filtered.filter((item) => item.rating && item.rating >= filters.ratingRange!.min!);
    }
    if (filters.ratingRange.max !== undefined && filters.ratingRange.max !== null) {
      filtered = filtered.filter((item) => item.rating && item.rating <= filters.ratingRange!.max!);
    }
  }

  // Rating preset filters
  if (filters.ratingFilter) {
    switch (filters.ratingFilter) {
      case 'critically_acclaimed':
        filtered = filtered.filter((item) => item.rating && item.rating >= 7.5);
        break;
      case 'hidden_gems':
        filtered = filtered.filter((item) => item.rating && item.rating >= 6.5 && item.rating <= 8.0);
        break;
      case 'top_rated':
        filtered = filtered.filter((item) => item.rating && item.rating >= 8.0);
        break;
    }
  }

  return filtered;
}
