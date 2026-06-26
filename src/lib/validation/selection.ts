import type { Filters } from '@/types/filters';

export type MediaType = 'movie' | 'show';
export type TvSelectionMode = 'show' | 'episode';

export interface SelectionRequestBody {
  libraryIds: string[];
  mediaType: MediaType;
  filters: Filters;
  tvSelectionMode?: TvSelectionMode;
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseStringArray(value: unknown, field: string): ParseResult<string[]> {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${field} must be an array of strings` };
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      return { ok: false, error: `${field} must be an array of strings` };
    }
  }
  return { ok: true, data: value };
}

function parseOptionalNumber(value: unknown, field: string): ParseResult<number | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined };
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return { ok: false, error: `${field} must be a number` };
  }
  return { ok: true, data: value };
}

function parseYearRange(value: unknown): ParseResult<Filters['yearRange']> {
  if (value === null || value === undefined) {
    return { ok: true, data: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'filters.yearRange must be an object' };
  }
  const range = value as Record<string, unknown>;
  const startResult = parseOptionalNumber(range.start, 'filters.yearRange.start');
  if (!startResult.ok) return startResult;
  const endResult = parseOptionalNumber(range.end, 'filters.yearRange.end');
  if (!endResult.ok) return endResult;
  return {
    ok: true,
    data: {
      start: startResult.data,
      end: endResult.data,
    },
  };
}

function parseRatingRange(value: unknown): ParseResult<Filters['ratingRange']> {
  if (value === null || value === undefined) {
    return { ok: true, data: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'filters.ratingRange must be an object' };
  }
  const range = value as Record<string, unknown>;
  const minResult = parseOptionalNumber(range.min, 'filters.ratingRange.min');
  if (!minResult.ok) return minResult;
  const maxResult = parseOptionalNumber(range.max, 'filters.ratingRange.max');
  if (!maxResult.ok) return maxResult;
  return {
    ok: true,
    data: {
      min: minResult.data,
      max: maxResult.data,
    },
  };
}

export function parseFilters(value: unknown): ParseResult<Filters> {
  if (value === null || value === undefined) {
    return { ok: true, data: {} as Filters };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'filters must be an object' };
  }

  const raw = value as Record<string, unknown>;
  const filters: Partial<Filters> = {};

  if ('genres' in raw) {
    const genres = parseStringArray(raw.genres, 'filters.genres');
    if (!genres.ok) return genres;
    filters.genres = genres.data;
  }

  if ('contentRatings' in raw) {
    const contentRatings = parseStringArray(raw.contentRatings, 'filters.contentRatings');
    if (!contentRatings.ok) return contentRatings;
    filters.contentRatings = contentRatings.data;
  }

  if ('studios' in raw) {
    const studios = parseStringArray(raw.studios, 'filters.studios');
    if (!studios.ok) return studios;
    filters.studios = studios.data;
  }

  if ('collections' in raw) {
    const collections = parseStringArray(raw.collections, 'filters.collections');
    if (!collections.ok) return collections;
    filters.collections = collections.data;
  }

  if ('unwatchedOnly' in raw) {
    if (typeof raw.unwatchedOnly !== 'boolean') {
      return { ok: false, error: 'filters.unwatchedOnly must be a boolean' };
    }
    filters.unwatchedOnly = raw.unwatchedOnly;
  }

  if ('ratingFilter' in raw) {
    if (raw.ratingFilter !== null && typeof raw.ratingFilter !== 'string') {
      return { ok: false, error: 'filters.ratingFilter must be a string or null' };
    }
    filters.ratingFilter = raw.ratingFilter as string | null;
  }

  if ('yearRange' in raw) {
    const yearRange = parseYearRange(raw.yearRange);
    if (!yearRange.ok) return yearRange;
    filters.yearRange = yearRange.data;
  }

  if ('ratingRange' in raw) {
    const ratingRange = parseRatingRange(raw.ratingRange);
    if (!ratingRange.ok) return ratingRange;
    filters.ratingRange = ratingRange.data;
  }

  return { ok: true, data: filters as Filters };
}

export function parseSelectionRequestBody(body: unknown): ParseResult<SelectionRequestBody> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.libraryIds)) {
    return { ok: false, error: 'libraryIds must be a non-empty array' };
  }
  for (const id of raw.libraryIds) {
    if (!isNonEmptyString(id)) {
      return { ok: false, error: 'libraryIds must be a non-empty array' };
    }
  }

  let mediaType: MediaType = 'movie';
  if (raw.mediaType !== undefined) {
    if (raw.mediaType !== 'movie' && raw.mediaType !== 'show') {
      return { ok: false, error: "mediaType must be 'movie' or 'show'" };
    }
    mediaType = raw.mediaType;
  }

  const filtersResult = parseFilters(raw.filters);
  if (!filtersResult.ok) {
    return filtersResult;
  }

  let tvSelectionMode: TvSelectionMode | undefined;
  if (raw.tvSelectionMode !== undefined) {
    if (raw.tvSelectionMode !== 'show' && raw.tvSelectionMode !== 'episode') {
      return { ok: false, error: "tvSelectionMode must be 'show' or 'episode'" };
    }
    tvSelectionMode = raw.tvSelectionMode;
  }

  if (mediaType === 'show' && tvSelectionMode === undefined) {
    // Optional field — no default required by spec
  }

  return {
    ok: true,
    data: {
      libraryIds: raw.libraryIds,
      mediaType,
      filters: filtersResult.data,
      tvSelectionMode,
    },
  };
}
