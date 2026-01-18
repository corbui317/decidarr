import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { WatchedItem } from '@/lib/models/WatchedItem';
import mongoose from 'mongoose';

// Use a constant ObjectId for single-user mode
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

interface Filters {
  genres?: string[];
  yearRange?: { start?: number; end?: number };
  contentRatings?: string[];
  studios?: string[];
  ratingRange?: { min?: number; max?: number };
  ratingFilter?: string;
  unwatchedOnly?: boolean;
}

interface FilterBreakdown {
  filterName: string;
  label: string;
  beforeCount: number;
  afterCount: number;
  itemsRemoved: number;
  causedEmpty: boolean;
}

interface DataStats {
  itemsWithRating: number;
  itemsWithContentRating: number;
  itemsWithStudio: number;
  itemsWithYear: number;
  itemsWithGenres: number;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
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
      const watchedItems = await WatchedItem.find({ userId: SINGLE_USER_ID }).lean();
      watchedIds = new Set(watchedItems.map((w) => w.plexId));
    }

    // Apply filters and track breakdown
    const result = getPoolCountWithBreakdown(allItems, filters as Filters, watchedIds, dataStats);

    return NextResponse.json({
      totalItems: allItems.length,
      matchingItems: result.matchingCount,
      filterBreakdown: result.breakdown,
      emptyReason: result.emptyReason,
      dataStats,
    });
  } catch (error) {
    if ((error as Error).message === 'App not configured') {
      return NextResponse.json({ error: 'App not configured' }, { status: 401 });
    }
    console.error('Pool count error:', error);
    return NextResponse.json(
      { error: 'Failed to get pool count' },
      { status: 500 }
    );
  }
}

function getPoolCountWithBreakdown(
  items: any[],
  filters: Filters,
  watchedIds: Set<string>,
  dataStats: DataStats
): { matchingCount: number; breakdown: FilterBreakdown[]; emptyReason: string | null } {
  const breakdown: FilterBreakdown[] = [];
  let current = [...items];
  let emptyReason: string | null = null;

  // Define filter steps
  const filterSteps = [
    {
      name: 'genres',
      label: 'Genres',
      active: filters.genres && filters.genres.length > 0,
      apply: (list: any[]) =>
        list.filter((item) => item.genres && item.genres.some((g: string) => filters.genres!.includes(g))),
      emptyMsg: () => `No items have the selected genres: ${filters.genres!.join(', ')}`,
    },
    {
      name: 'yearRange',
      label: 'Year Range',
      active: filters.yearRange?.start || filters.yearRange?.end,
      apply: (list: any[]) => {
        let filtered = list;
        if (filters.yearRange?.start) {
          filtered = filtered.filter((item) => item.year && item.year >= filters.yearRange!.start!);
        }
        if (filters.yearRange?.end) {
          filtered = filtered.filter((item) => item.year && item.year <= filters.yearRange!.end!);
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
      apply: (list: any[]) =>
        list.filter((item) => item.contentRating && filters.contentRatings!.includes(item.contentRating)),
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
      apply: (list: any[]) =>
        list.filter((item) => {
          if (!item.studio) return false;
          const itemStudio = item.studio.toLowerCase();
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
      apply: (list: any[]) => {
        let filtered = list;
        if (filters.ratingRange?.min != null) {
          filtered = filtered.filter((item) => item.rating && item.rating >= filters.ratingRange!.min!);
        }
        if (filters.ratingRange?.max != null) {
          filtered = filtered.filter((item) => item.rating && item.rating <= filters.ratingRange!.max!);
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
      apply: (list: any[]) => {
        switch (filters.ratingFilter) {
          case 'critically_acclaimed':
            return list.filter((item) => item.rating && item.rating >= 7.5);
          case 'hidden_gems':
            return list.filter((item) => item.rating && item.rating >= 6.5 && item.rating <= 8.0);
          case 'top_rated':
            return list.filter((item) => item.rating && item.rating >= 8.0);
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
      apply: (list: any[]) => list.filter((item) => !watchedIds.has(item.plexId)),
      emptyMsg: () => 'All matching items have been marked as watched',
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
