import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { getOverseerrConfig } from '@/lib/auth';
import { applyOverseerrPoolFilter } from '@/lib/selection/filters';
import type { OverseerrAvailability } from '@/types/overseerr';
import type { Filters, FilterBreakdown, DataStats } from '@/types/filters';

const logger = createLogger('API:PoolCount');

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    const { plexToken, plexServerUrl, settings, user } = auth;
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

    const allowedLibraryIds = await getAccessibleLibraryIds(auth, libraryIds);

    const machineId = settings.plexMachineId;
    if (!machineId) {
      return NextResponse.json({
        totalItems: 0,
        matchingItems: 0,
        filterBreakdown: [],
        emptyReason: 'Plex machine ID not configured',
        dataStats: {
          itemsWithRating: 0,
          itemsWithContentRating: 0,
          itemsWithStudio: 0,
          itemsWithYear: 0,
          itemsWithGenres: 0,
        },
      });
    }

    const overseerrConfig = await getOverseerrConfig();

    // Get cached items from selected libraries
    const caches = await LibraryCache.find({
      plexMachineId: machineId,
      libraryId: { $in: allowedLibraryIds },
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
    const dataStats: DataStats = {
      itemsWithRating: allItems.filter((i) => i.rating != null).length,
      itemsWithContentRating: allItems.filter((i) => i.contentRating).length,
      itemsWithStudio: allItems.filter((i) => i.studio).length,
      itemsWithYear: allItems.filter((i) => i.year != null).length,
      itemsWithGenres: allItems.filter((i) => i.genres && i.genres.length > 0).length,
    };

    // Get watched items for unwatched filter
    let watchedIds = new Set<string>();
    if (filters.unwatchedOnly) {
      const watchedItems = await WatchedItem.find({ userId: user._id }).lean();
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
    const result = getPoolCountWithBreakdown(
      allItems,
      filters as Filters,
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
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Pool count error:', error);
    return NextResponse.json({ error: 'Failed to get pool count' }, { status: 500 });
  }
}

function getPoolCountWithBreakdown(
  items: Record<string, unknown>[],
  filters: Filters,
  watchedIds: Set<string>,
  dataStats: DataStats,
  collectionItemIds: Set<string> | null,
  overseerrFilterEnabled: boolean
): { matchingCount: number; breakdown: FilterBreakdown[]; emptyReason: string | null } {
  const breakdown: FilterBreakdown[] = [];
  let current = [...items];
  let emptyReason: string | null = null;

  // Define filter steps
  const filterSteps = [
    {
      name: 'collections',
      label: 'Collections',
      active: collectionItemIds !== null,
      apply: (list: Record<string, unknown>[]) =>
        list.filter((item) => collectionItemIds!.has(item.plexId as string)),
      emptyMsg: () => 'No items found in the selected collections',
    },
    {
      name: 'genres',
      label: 'Genres',
      active: filters.genres && filters.genres.length > 0,
      apply: (list: Record<string, unknown>[]) =>
        list.filter((item) => (item.genres as string[])?.some((g: string) => filters.genres!.includes(g))),
      emptyMsg: () => `No items have the selected genres: ${filters.genres!.join(', ')}`,
    },
    {
      name: 'yearRange',
      label: 'Year Range',
      active: filters.yearRange?.start || filters.yearRange?.end,
      apply: (list: Record<string, unknown>[]) => {
        let filtered = list;
        if (filters.yearRange?.start) {
          filtered = filtered.filter((item) => (item.year as number) >= filters.yearRange!.start!);
        }
        if (filters.yearRange?.end) {
          filtered = filtered.filter((item) => (item.year as number) <= filters.yearRange!.end!);
        }
        return filtered;
      },
      emptyMsg: () =>
        `No items found in year range ${filters.yearRange?.start || '...'} - ${filters.yearRange?.end || '...'}`,
    },
    {
      name: 'contentRatings',
      label: 'Age Rating',
      active: filters.contentRatings && filters.contentRatings.length > 0,
      apply: (list: Record<string, unknown>[]) =>
        list.filter((item) => item.contentRating && filters.contentRatings!.includes(item.contentRating as string)),
      emptyMsg: () => {
        if (dataStats.itemsWithContentRating === 0) {
          return 'Age Rating filter active, but no items in your library have age ratings. Try syncing your library to fetch this data from TMDb.';
        }
        return `No items have the selected age ratings: ${filters.contentRatings!.join(', ')}`;
      },
    },
    {
      name: 'studios',
      label: 'Studios/Networks',
      active: filters.studios && filters.studios.length > 0,
      apply: (list: Record<string, unknown>[]) =>
        list.filter((item) => {
          if (!item.studio) return false;
          const itemStudio = (item.studio as string).toLowerCase();
          return filters.studios!.some((studio) => itemStudio.includes(studio.toLowerCase()));
        }),
      emptyMsg: () => {
        if (dataStats.itemsWithStudio === 0) {
          return 'Studios filter active, but no items in your library have studio/network info. Try syncing your library to fetch this data from TMDb.';
        }
        return `No items found from selected studios/networks: ${filters.studios!.join(', ')}`;
      },
    },
    {
      name: 'ratingRange',
      label: 'Score Rating (Custom)',
      active: filters.ratingRange?.min != null || filters.ratingRange?.max != null,
      apply: (list: Record<string, unknown>[]) => {
        let filtered = list;
        if (filters.ratingRange?.min != null) {
          filtered = filtered.filter((item) => (item.rating as number) >= filters.ratingRange!.min!);
        }
        if (filters.ratingRange?.max != null) {
          filtered = filtered.filter((item) => (item.rating as number) <= filters.ratingRange!.max!);
        }
        return filtered;
      },
      emptyMsg: () => {
        if (dataStats.itemsWithRating === 0) {
          return 'Score Rating filter active, but no items in your library have ratings. Try syncing your library to fetch ratings from TMDb.';
        }
        return `No items match score rating ${filters.ratingRange?.min || 0} - ${filters.ratingRange?.max || 10}`;
      },
    },
    {
      name: 'ratingFilter',
      label: 'Score Rating (Preset)',
      active: !!filters.ratingFilter,
      apply: (list: Record<string, unknown>[]) => {
        switch (filters.ratingFilter) {
          case 'critically_acclaimed':
            return list.filter((item) => (item.rating as number) >= 7.5);
          case 'hidden_gems':
            return list.filter((item) => {
              const r = item.rating as number;
              return r >= 6.5 && r <= 8.0;
            });
          case 'top_rated':
            return list.filter((item) => (item.rating as number) >= 8.0);
          default:
            return list;
        }
      },
      emptyMsg: () => {
        if (dataStats.itemsWithRating === 0) {
          return 'Score Rating filter active, but no items in your library have ratings. Try syncing your library to fetch ratings from TMDb.';
        }
        const presetNames: Record<string, string> = {
          critically_acclaimed: 'Highly Rated (7.5+)',
          hidden_gems: 'Hidden Gems (6.5-8.0)',
          top_rated: 'Top Rated (8.0+)',
        };
        return `No items match "${presetNames[filters.ratingFilter!] || filters.ratingFilter}"`;
      },
    },
    {
      name: 'unwatchedOnly',
      label: 'Unwatched Only',
      active: filters.unwatchedOnly,
      apply: (list: Record<string, unknown>[]) => list.filter((item) => !watchedIds.has(item.plexId as string)),
      emptyMsg: () => 'All matching items have been marked as watched',
    },
    {
      name: 'overseerrAvailable',
      label: 'Overseerr (exclude available)',
      active: overseerrFilterEnabled,
      apply: (list: Record<string, unknown>[]) =>
        applyOverseerrPoolFilter(
          list as { overseerrStatus?: OverseerrAvailability }[],
          true
        ) as Record<string, unknown>[],
      emptyMsg: () =>
        'All matching items are fully available in Overseerr. Disable the Overseerr filter or sync your library.',
    },
  ];

  // Apply each filter
  for (const step of filterSteps) {
    if (step.active) {
      const beforeCount = current.length;
      current = step.apply(current);
      const afterCount = current.length;
      const causedEmpty = beforeCount > 0 && afterCount === 0;

      breakdown.push({
        filterName: step.name,
        label: step.label,
        beforeCount,
        afterCount,
        itemsRemoved: beforeCount - afterCount,
        causedEmpty,
      });

      if (causedEmpty && !emptyReason) {
        emptyReason = step.emptyMsg();
      }
    }
  }

  return {
    matchingCount: current.length,
    breakdown,
    emptyReason,
  };
}
