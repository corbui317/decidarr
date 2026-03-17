export interface Filters {
  genres: string[];
  yearRange: { start?: number; end?: number } | null;
  contentRatings: string[];
  studios: string[];
  ratingRange: { min?: number; max?: number } | null;
  ratingFilter: string | null;
  unwatchedOnly: boolean;
  collections: string[];
}

export const DEFAULT_FILTERS: Filters = {
  genres: [],
  yearRange: null,
  contentRatings: [],
  studios: [],
  ratingRange: null,
  ratingFilter: null,
  unwatchedOnly: false,
  collections: [],
};

export interface FilterBreakdown {
  filterName: string;
  label: string;
  beforeCount: number;
  afterCount: number;
  itemsRemoved: number;
  causedEmpty: boolean;
}

export interface DataStats {
  itemsWithRating: number;
  itemsWithContentRating: number;
  itemsWithStudio: number;
  itemsWithYear: number;
  itemsWithGenres: number;
}

export interface PoolCountResult {
  totalItems: number;
  matchingItems: number;
  filterBreakdown: FilterBreakdown[];
  emptyReason: string | null;
  dataStats: DataStats;
}
