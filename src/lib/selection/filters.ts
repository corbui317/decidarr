import type { Filters } from '@/types/filters';
import type { OverseerrAvailability } from '@/types/overseerr';

export interface PoolFilterItem {
  plexId: string;
  genres?: string[];
  year?: number;
  contentRating?: string;
  studio?: string;
  rating?: number;
  overseerrStatus?: OverseerrAvailability;
}

export function applyOverseerrPoolFilter<T extends { overseerrStatus?: OverseerrAvailability }>(
  items: T[],
  filterEnabled: boolean
): T[] {
  if (!filterEnabled) return items;
  return items.filter((item) => item.overseerrStatus !== 'available');
}

export function applyFilters(items: PoolFilterItem[], filters: Filters): PoolFilterItem[] {
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
      filtered = filtered.filter((item) => item.rating && item.rating >= filters.ratingRange!.min!);
    }
    if (filters.ratingRange.max !== undefined && filters.ratingRange.max !== null) {
      filtered = filtered.filter((item) => item.rating && item.rating <= filters.ratingRange!.max!);
    }
  }

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
