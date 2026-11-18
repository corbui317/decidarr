import type { Filters, FilterBreakdown, DataStats } from '@/types/filters';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import type { OverseerrAvailability } from '@/types/overseerr';

export type FilterableItem = Pick<
  ILibraryItem,
  'plexId' | 'genres' | 'year' | 'contentRating' | 'studio' | 'rating' | 'overseerrStatus'
>;

export function applyOverseerrPoolFilter<T extends { overseerrStatus?: OverseerrAvailability }>(
  items: T[],
  filterEnabled: boolean
): T[] {
  if (!filterEnabled) return items;
  return items.filter((item) => item.overseerrStatus !== 'available');
}

export function applyItemFilters<T extends FilterableItem>(
  items: T[],
  filters: Filters
): T[] {
  let filtered = [...items];

  if (filters.genres && filters.genres.length > 0) {
    filtered = filtered.filter(
      (item) => item.genres && item.genres.some((g) => filters.genres!.includes(g))
    );
  }

  if (filters.yearRange) {
    if (filters.yearRange.start) {
      filtered = filtered.filter((item) => item.year && item.year >= filters.yearRange!.start!);
    }
    if (filters.yearRange.end) {
      filtered = filtered.filter((item) => item.year && item.year <= filters.yearRange!.end!);
    }
  }

  if (filters.contentRatings && filters.contentRatings.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.contentRating) return false;
      return filters.contentRatings!.includes(item.contentRating);
    });
  }

  if (filters.studios && filters.studios.length > 0) {
    filtered = filtered.filter((item) => {
      if (!item.studio) return false;
      const itemStudio = item.studio.toLowerCase();
      return filters.studios!.some((studio) => itemStudio.includes(studio.toLowerCase()));
    });
  }

  if (filters.ratingRange) {
    if (filters.ratingRange.min !== undefined && filters.ratingRange.min !== null) {
      filtered = filtered.filter(
        (item) => item.rating && item.rating >= filters.ratingRange!.min!
      );
    }
    if (filters.ratingRange.max !== undefined && filters.ratingRange.max !== null) {
      filtered = filtered.filter(
        (item) => item.rating && item.rating <= filters.ratingRange!.max!
      );
    }
  }

  if (filters.ratingFilter) {
    switch (filters.ratingFilter) {
      case 'critically_acclaimed':
        filtered = filtered.filter((item) => item.rating && item.rating >= 7.5);
        break;
      case 'hidden_gems':
        filtered = filtered.filter(
          (item) => item.rating && item.rating >= 6.5 && item.rating <= 8.0
        );
        break;
      case 'top_rated':
        filtered = filtered.filter((item) => item.rating && item.rating >= 8.0);
        break;
    }
  }

  return filtered;
}

export const applyFilters = applyItemFilters;

export function filterByCollections<T extends FilterableItem>(
  items: T[],
  collectionItemIds: Set<string>
): T[] {
  return items.filter((item) => collectionItemIds.has(item.plexId));
}

export function filterUnwatched<T extends FilterableItem>(
  items: T[],
  watchedIds: Set<string>
): T[] {
  return items.filter((item) => !watchedIds.has(item.plexId));
}

export function computeDataStats(items: FilterableItem[]): DataStats {
  return {
    itemsWithRating: items.filter((i) => i.rating != null).length,
    itemsWithContentRating: items.filter((i) => i.contentRating).length,
    itemsWithStudio: items.filter((i) => i.studio).length,
    itemsWithYear: items.filter((i) => i.year != null).length,
    itemsWithGenres: items.filter((i) => i.genres && i.genres.length > 0).length,
  };
}

export function getPoolCountWithBreakdown(
  items: FilterableItem[],
  filters: Filters,
  watchedIds: Set<string>,
  dataStats: DataStats,
  collectionItemIds: Set<string> | null,
  overseerrFilterEnabled = false
): { matchingCount: number; breakdown: FilterBreakdown[]; emptyReason: string | null } {
  const breakdown: FilterBreakdown[] = [];
  let current: FilterableItem[] = [...items];
  let emptyReason: string | null = null;

  const filterSteps = [
    {
      name: 'collections',
      label: 'Collections',
      active: collectionItemIds !== null,
      apply: (list: FilterableItem[]) => filterByCollections(list, collectionItemIds!),
      emptyMsg: () => 'No items found in the selected collections',
    },
    {
      name: 'genres',
      label: 'Genres',
      active: filters.genres && filters.genres.length > 0,
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          yearRange: null,
          contentRatings: [],
          studios: [],
          ratingRange: null,
          ratingFilter: null,
          unwatchedOnly: false,
          collections: [],
        }),
      emptyMsg: () => `No items have the selected genres: ${filters.genres!.join(', ')}`,
    },
    {
      name: 'yearRange',
      label: 'Year Range',
      active: !!(filters.yearRange?.start || filters.yearRange?.end),
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          genres: [],
          contentRatings: [],
          studios: [],
          ratingRange: null,
          ratingFilter: null,
          unwatchedOnly: false,
          collections: [],
        }),
      emptyMsg: () =>
        `No items found in year range ${filters.yearRange?.start || '...'} - ${filters.yearRange?.end || '...'}`,
    },
    {
      name: 'contentRatings',
      label: 'Age Rating',
      active: filters.contentRatings && filters.contentRatings.length > 0,
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          genres: [],
          yearRange: null,
          studios: [],
          ratingRange: null,
          ratingFilter: null,
          unwatchedOnly: false,
          collections: [],
        }),
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
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          genres: [],
          yearRange: null,
          contentRatings: [],
          ratingRange: null,
          ratingFilter: null,
          unwatchedOnly: false,
          collections: [],
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
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          genres: [],
          yearRange: null,
          contentRatings: [],
          studios: [],
          ratingFilter: null,
          unwatchedOnly: false,
          collections: [],
        }),
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
      apply: (list: FilterableItem[]) =>
        applyItemFilters(list, {
          ...filters,
          genres: [],
          yearRange: null,
          contentRatings: [],
          studios: [],
          ratingRange: null,
          unwatchedOnly: false,
          collections: [],
        }),
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
      apply: (list: FilterableItem[]) => filterUnwatched(list, watchedIds),
      emptyMsg: () => 'All matching items have been marked as watched',
    },
    {
      name: 'overseerrAvailable',
      label: 'Overseerr (exclude available)',
      active: overseerrFilterEnabled,
      apply: (list: FilterableItem[]) => applyOverseerrPoolFilter(list, true),
      emptyMsg: () =>
        'All matching items are fully available in Overseerr. Disable the Overseerr filter or sync your library.',
    },
  ];

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

export function applyFullFilters<T extends FilterableItem>(
  items: T[],
  filters: Filters,
  watchedIds: Set<string>,
  collectionItemIds: Set<string> | null,
  overseerrFilterEnabled = false
): T[] {
  let result = [...items];

  if (collectionItemIds !== null) {
    result = filterByCollections(result, collectionItemIds);
  }

  result = applyItemFilters(result, filters);

  if (filters.unwatchedOnly) {
    result = filterUnwatched(result, watchedIds);
  }

  return applyOverseerrPoolFilter(result, overseerrFilterEnabled);
}
