import { describe, it, expect } from 'vitest';
import { parseSelectionRequestBody, parseFilters } from '@/lib/validation/selection';

describe('parseFilters', () => {
  it('treats null as empty filters', () => {
    const result = parseFilters(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it('rejects non-object filters', () => {
    const result = parseFilters('not-an-object');
    expect(result).toEqual({ ok: false, error: 'filters must be an object' });
  });

  it('rejects collections that are not an array', () => {
    const result = parseFilters({ collections: 'not-an-array' });
    expect(result).toEqual({
      ok: false,
      error: 'filters.collections must be an array of strings',
    });
  });

  it('rejects unwatchedOnly that is not boolean', () => {
    const result = parseFilters({ unwatchedOnly: 'yes' });
    expect(result).toEqual({
      ok: false,
      error: 'filters.unwatchedOnly must be a boolean',
    });
  });

  it('accepts valid filter fields', () => {
    const result = parseFilters({
      genres: ['Action'],
      collections: ['col-1'],
      unwatchedOnly: true,
      yearRange: { start: 2000, end: 2020 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.genres).toEqual(['Action']);
      expect(result.data.collections).toEqual(['col-1']);
      expect(result.data.unwatchedOnly).toBe(true);
      expect(result.data.yearRange).toEqual({ start: 2000, end: 2020 });
    }
  });

  it('ignores unknown filter keys', () => {
    const result = parseFilters({ futureFilter: true, genres: ['Drama'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ genres: ['Drama'] });
    }
  });
});

describe('parseSelectionRequestBody', () => {
  it('accepts a valid movie request', () => {
    const result = parseSelectionRequestBody({
      libraryIds: ['lib-1'],
      mediaType: 'movie',
      filters: { genres: ['Sci-Fi'] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mediaType).toBe('movie');
      expect(result.data.libraryIds).toEqual(['lib-1']);
    }
  });

  it('defaults mediaType to movie when omitted', () => {
    const result = parseSelectionRequestBody({ libraryIds: ['lib-1'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.mediaType).toBe('movie');
    }
  });

  it('rejects invalid mediaType', () => {
    const result = parseSelectionRequestBody({
      libraryIds: ['lib-1'],
      mediaType: 'invalid',
    });
    expect(result).toEqual({
      ok: false,
      error: "mediaType must be 'movie' or 'show'",
    });
  });

  it('rejects missing libraryIds', () => {
    const result = parseSelectionRequestBody({ mediaType: 'movie' });
    expect(result).toEqual({
      ok: false,
      error: 'libraryIds must be a non-empty array',
    });
  });

  it('allows empty libraryIds array for route-specific handling', () => {
    const result = parseSelectionRequestBody({
      libraryIds: [],
      mediaType: 'movie',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.libraryIds).toEqual([]);
    }
  });

  it('rejects libraryIds with empty strings', () => {
    const result = parseSelectionRequestBody({
      libraryIds: ['lib-1', ''],
      mediaType: 'movie',
    });
    expect(result).toEqual({
      ok: false,
      error: 'libraryIds must be a non-empty array',
    });
  });

  it('rejects invalid tvSelectionMode', () => {
    const result = parseSelectionRequestBody({
      libraryIds: ['lib-1'],
      mediaType: 'show',
      tvSelectionMode: 'season',
    });
    expect(result).toEqual({
      ok: false,
      error: "tvSelectionMode must be 'show' or 'episode'",
    });
  });

  it('accepts show request with tvSelectionMode', () => {
    const result = parseSelectionRequestBody({
      libraryIds: ['lib-1'],
      mediaType: 'show',
      tvSelectionMode: 'episode',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tvSelectionMode).toBe('episode');
    }
  });
});
