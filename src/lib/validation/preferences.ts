import {
  APP_THEMES,
  ANIMATION_STYLES,
  ANIMATION_SPEEDS,
  type MediaType,
  type TvSelectionMode,
  type AppTheme,
  type AnimationStyle,
  type AnimationSpeed,
} from '@decidarr/api-contracts';

import { type ParseResult, parseStringArray } from './common';

const VALID_THEMES = APP_THEMES;
const VALID_ANIMATION_STYLES = ANIMATION_STYLES;
const VALID_ANIMATION_SPEEDS = ANIMATION_SPEEDS;
const VALID_MEDIA_TYPES: MediaType[] = ['movie', 'show'];
const VALID_TV_SELECTION_MODES: TvSelectionMode[] = ['show', 'episode'];

export interface SpinHistoryPreferencesPatch {
  enabled?: boolean;
  retentionLimit?: number;
  storeFilterSnapshot?: boolean;
}

export interface PreferencesPatchBody {
  spinHistory: SpinHistoryPreferencesPatch;
}

export interface SavedFilters {
  genres?: string[];
  studios?: string[];
  yearRange?: { start?: number; end?: number };
  ratingRange?: { min?: number; max?: number };
  ratingFilter?: string | null;
  contentRatings?: string[];
  collections?: string[];
  unwatchedOnly?: boolean;
}

export interface PreferencesPutBody {
  theme?: AppTheme;
  defaultMediaType?: MediaType;
  tvSelectionMode?: TvSelectionMode;
  savedFilters?: SavedFilters;
  selectedLibraries?: string[];
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  spinHistory?: SpinHistoryPreferencesPatch;
}

/**
 * Shared parser for spinHistory patch.
 * Used by both PATCH and PUT handlers.
 */
function parseSpinHistoryPatch(spinHistoryRaw: Record<string, unknown>): ParseResult<SpinHistoryPreferencesPatch> {
  const spinHistory: SpinHistoryPreferencesPatch = {};

  if ('enabled' in spinHistoryRaw) {
    if (typeof spinHistoryRaw.enabled !== 'boolean') {
      return { ok: false, error: 'spinHistory.enabled must be a boolean' };
    }
    spinHistory.enabled = spinHistoryRaw.enabled;
  }

  if ('retentionLimit' in spinHistoryRaw) {
    if (
      typeof spinHistoryRaw.retentionLimit !== 'number' ||
      Number.isNaN(spinHistoryRaw.retentionLimit)
    ) {
      return { ok: false, error: 'spinHistory.retentionLimit must be a number' };
    }
    spinHistory.retentionLimit = spinHistoryRaw.retentionLimit;
  }

  if ('storeFilterSnapshot' in spinHistoryRaw) {
    if (typeof spinHistoryRaw.storeFilterSnapshot !== 'boolean') {
      return { ok: false, error: 'spinHistory.storeFilterSnapshot must be a boolean' };
    }
    spinHistory.storeFilterSnapshot = spinHistoryRaw.storeFilterSnapshot;
  }

  return { ok: true, data: spinHistory };
}

export function parsePreferencesPatchBody(body: unknown): ParseResult<PreferencesPatchBody> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (!raw.spinHistory || typeof raw.spinHistory !== 'object' || Array.isArray(raw.spinHistory)) {
    return { ok: false, error: 'No valid preference fields provided' };
  }

  const spinHistoryRaw = raw.spinHistory as Record<string, unknown>;
  const result = parseSpinHistoryPatch(spinHistoryRaw);

  if (!result.ok) {
    return result;
  }

  const spinHistory = result.data;
  if (Object.keys(spinHistory).length === 0) {
    return { ok: false, error: 'No valid preference fields provided' };
  }

  return { ok: true, data: { spinHistory } };
}

function validateSavedFilters(filters: unknown): ParseResult<SavedFilters> {
  if (filters === null || typeof filters !== 'object' || Array.isArray(filters)) {
    return { ok: false, error: 'savedFilters must be an object' };
  }

  const raw = filters as Record<string, unknown>;
  const validated: SavedFilters = {};

  if ('genres' in raw) {
    const genres = parseStringArray(raw.genres, 'savedFilters.genres');
    if (!genres.ok) return genres;
    validated.genres = genres.data;
  }

  if ('studios' in raw) {
    const studios = parseStringArray(raw.studios, 'savedFilters.studios');
    if (!studios.ok) return studios;
    validated.studios = studios.data;
  }

  if ('contentRatings' in raw) {
    const contentRatings = parseStringArray(raw.contentRatings, 'savedFilters.contentRatings');
    if (!contentRatings.ok) return contentRatings;
    validated.contentRatings = contentRatings.data;
  }

  if ('collections' in raw) {
    const collections = parseStringArray(raw.collections, 'savedFilters.collections');
    if (!collections.ok) return collections;
    validated.collections = collections.data;
  }

  if ('yearRange' in raw) {
    if (raw.yearRange === null || typeof raw.yearRange !== 'object' || Array.isArray(raw.yearRange)) {
      return { ok: false, error: 'savedFilters.yearRange must be an object' };
    }
    const yearRange = raw.yearRange as Record<string, unknown>;
    validated.yearRange = {};
    if ('start' in yearRange) {
      if (typeof yearRange.start !== 'number') {
        return { ok: false, error: 'savedFilters.yearRange.start must be a number' };
      }
      validated.yearRange.start = yearRange.start;
    }
    if ('end' in yearRange) {
      if (typeof yearRange.end !== 'number') {
        return { ok: false, error: 'savedFilters.yearRange.end must be a number' };
      }
      validated.yearRange.end = yearRange.end;
    }
  }

  if ('ratingRange' in raw) {
    if (raw.ratingRange === null || typeof raw.ratingRange !== 'object' || Array.isArray(raw.ratingRange)) {
      return { ok: false, error: 'savedFilters.ratingRange must be an object' };
    }
    const ratingRange = raw.ratingRange as Record<string, unknown>;
    validated.ratingRange = {};
    if ('min' in ratingRange) {
      if (typeof ratingRange.min !== 'number') {
        return { ok: false, error: 'savedFilters.ratingRange.min must be a number' };
      }
      validated.ratingRange.min = ratingRange.min;
    }
    if ('max' in ratingRange) {
      if (typeof ratingRange.max !== 'number') {
        return { ok: false, error: 'savedFilters.ratingRange.max must be a number' };
      }
      validated.ratingRange.max = ratingRange.max;
    }
  }

  if ('ratingFilter' in raw) {
    if (raw.ratingFilter !== null && typeof raw.ratingFilter !== 'string') {
      return { ok: false, error: 'savedFilters.ratingFilter must be a string or null' };
    }
    validated.ratingFilter = raw.ratingFilter as string | null;
  }

  if ('unwatchedOnly' in raw) {
    if (typeof raw.unwatchedOnly !== 'boolean') {
      return { ok: false, error: 'savedFilters.unwatchedOnly must be a boolean' };
    }
    validated.unwatchedOnly = raw.unwatchedOnly;
  }

  return { ok: true, data: validated };
}

export function parsePreferencesPutBody(body: unknown): ParseResult<PreferencesPutBody> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;
  const validated: PreferencesPutBody = {};

  if ('theme' in raw) {
    if (typeof raw.theme !== 'string' || !VALID_THEMES.includes(raw.theme as AppTheme)) {
      return { ok: false, error: 'theme must be one of: dark, light, vegas, macao, poker' };
    }
    validated.theme = raw.theme as AppTheme;
  }

  if ('defaultMediaType' in raw) {
    if (typeof raw.defaultMediaType !== 'string' || !VALID_MEDIA_TYPES.includes(raw.defaultMediaType as MediaType)) {
      return { ok: false, error: 'defaultMediaType must be either movie or show' };
    }
    validated.defaultMediaType = raw.defaultMediaType as MediaType;
  }

  if ('tvSelectionMode' in raw) {
    if (typeof raw.tvSelectionMode !== 'string' || !VALID_TV_SELECTION_MODES.includes(raw.tvSelectionMode as TvSelectionMode)) {
      return { ok: false, error: 'tvSelectionMode must be either show or episode' };
    }
    validated.tvSelectionMode = raw.tvSelectionMode as TvSelectionMode;
  }

  if ('savedFilters' in raw) {
    const filtersResult = validateSavedFilters(raw.savedFilters);
    if (!filtersResult.ok) {
      return filtersResult;
    }
    validated.savedFilters = filtersResult.data;
  }

  if ('selectedLibraries' in raw) {
    const selectedLibraries = parseStringArray(raw.selectedLibraries, 'selectedLibraries');
    if (!selectedLibraries.ok) return selectedLibraries;
    validated.selectedLibraries = selectedLibraries.data;
  }

  if ('animationStyle' in raw) {
    if (typeof raw.animationStyle !== 'string' || !VALID_ANIMATION_STYLES.includes(raw.animationStyle as AnimationStyle)) {
      return { ok: false, error: 'animationStyle must be one of: slots, roulette, wheel, plinko, random' };
    }
    validated.animationStyle = raw.animationStyle as AnimationStyle;
  }

  if ('animationSpeed' in raw) {
    if (typeof raw.animationSpeed !== 'string' || !VALID_ANIMATION_SPEEDS.includes(raw.animationSpeed as AnimationSpeed)) {
      return { ok: false, error: 'animationSpeed must be one of: fast, normal, dramatic' };
    }
    validated.animationSpeed = raw.animationSpeed as AnimationSpeed;
  }

  if ('spinHistory' in raw) {
    if (raw.spinHistory === null || typeof raw.spinHistory !== 'object' || Array.isArray(raw.spinHistory)) {
      return { ok: false, error: 'spinHistory must be an object' };
    }
    const spinHistoryRaw = raw.spinHistory as Record<string, unknown>;
    const result = parseSpinHistoryPatch(spinHistoryRaw);

    if (!result.ok) {
      return result;
    }

    validated.spinHistory = result.data;
  }

  if (Object.keys(validated).length === 0) {
    return { ok: false, error: 'No valid preference fields provided' };
  }

  return { ok: true, data: validated };
}
