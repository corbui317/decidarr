/**
 * Shared types used across client, routes, and models.
 * Single source of truth for core application types.
 */

export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';
export const APP_THEMES: readonly AppTheme[] = ['dark', 'light', 'vegas', 'macao', 'poker'] as const;

export type AnimationStyle = 'slots' | 'roulette' | 'wheel' | 'plinko' | 'random';
export const ANIMATION_STYLES: readonly AnimationStyle[] = ['slots', 'roulette', 'wheel', 'plinko', 'random'] as const;

export type AnimationSpeed = 'fast' | 'normal' | 'dramatic';
export const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ['fast', 'normal', 'dramatic'] as const;

export type MediaType = 'movie' | 'show';

export type MediaTypeWithEpisode = MediaType | 'episode';

export type TvSelectionMode = 'show' | 'episode';

/**
 * Selection parameters bundled into one type.
 * Used for random selection and pool count requests.
 * Uses the real Filters type to match the validated request body.
 */
export interface SelectionParameters {
  libraryIds: string[];
  mediaType: MediaType;
  filters: {
    genres: string[];
    yearRange: { start?: number; end?: number } | null;
    contentRatings: string[];
    studios: string[];
    ratingRange: { min?: number; max?: number } | null;
    ratingFilter: string | null;
    unwatchedOnly: boolean;
    collections: string[];
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
  error: string;
  code: SelectionErrorCode;
  suggestion?: string;
}
