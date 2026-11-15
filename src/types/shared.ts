/**
 * Shared types used across client, routes, and models.
 * Single source of truth for core application types.
 */

export type MediaType = 'movie' | 'show';

export type MediaTypeWithEpisode = MediaType | 'episode';

export type TvSelectionMode = 'show' | 'episode';

/**
 * Selection parameters bundled into one type.
 * Used for random selection and pool count requests.
 */
export interface SelectionParameters {
  libraryIds: string[];
  mediaType: MediaType;
  filters: {
    unwatchedOnly?: boolean;
    genres?: string[];
    studios?: string[];
    yearRange?: { min?: number; max?: number };
    ratingRange?: { min?: number; max?: number };
    contentRatings?: string[];
    collections?: string[];
  };
  tvSelectionMode?: TvSelectionMode;
}

/**
 * Empty data stats object shape.
 * Returned when there are no items to compute stats from.
 */
export const EMPTY_DATA_STATS = {
  itemsWithRating: 0,
  itemsWithContentRating: 0,
  itemsWithStudio: 0,
  itemsWithYear: 0,
  itemsWithGenres: 0,
} as const;

export type DataStats = typeof EMPTY_DATA_STATS;

/**
 * Selection error codes for typed error handling.
 */
export type SelectionErrorCode =
  | 'NO_LIBRARIES'
  | 'NO_ACCESSIBLE_LIBRARIES'
  | 'MACHINE_ID_MISSING'
  | 'NO_ITEMS_IN_LIBRARIES'
  | 'NO_ITEMS_MATCH_FILTERS'
  | 'INVALID_SELECTION_PARAMS';

export interface SelectionError {
  code: SelectionErrorCode;
  message: string;
  suggestion?: string;
}
