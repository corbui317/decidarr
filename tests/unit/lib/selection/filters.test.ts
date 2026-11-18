import { describe, it, expect } from 'vitest';
import {
  applyItemFilters,
  applyFullFilters,
  getPoolCountWithBreakdown,
  computeDataStats,
  filterUnwatched,
} from '@/lib/selection/filters';
import { SAMPLE_LIBRARY_ITEMS } from '../../../fixtures/library-items';
import { DEFAULT_FILTERS } from '@/types/filters';

describe('applyItemFilters', () => {
  it('filters by genre', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      genres: ['Sci-Fi'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Inception');
  });

  it('filters by year range', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      yearRange: { start: 2010, end: 2020 },
    });
    expect(result.map((i) => i.title)).toEqual(
      expect.arrayContaining(['Inception', 'Parasite', 'Hidden Gem Film', 'No Rating Movie'])
    );
    expect(result.find((i) => i.title === 'Old Classic')).toBeUndefined();
  });

  it('filters by content rating', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      contentRatings: ['PG'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Old Classic');
  });

  it('filters by studio substring', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      studios: ['netflix'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('No Rating Movie');
  });

  it('filters by rating preset top_rated', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      ratingFilter: 'top_rated',
    });
    expect(result.every((i) => (i.rating ?? 0) >= 8.0)).toBe(true);
  });

  it('filters by custom rating range', () => {
    const result = applyItemFilters(SAMPLE_LIBRARY_ITEMS, {
      ...DEFAULT_FILTERS,
      ratingRange: { min: 7.0, max: 8.0 },
    });
    expect(result.map((i) => i.title)).toEqual(
      expect.arrayContaining(['Hidden Gem Film', 'Old Classic'])
    );
  });
});

describe('filterUnwatched', () => {
  it('excludes watched plex ids', () => {
    const watched = new Set(['1', '3']);
    const result = filterUnwatched(SAMPLE_LIBRARY_ITEMS, watched);
    expect(result.find((i) => i.plexId === '1')).toBeUndefined();
    expect(result.find((i) => i.plexId === '3')).toBeUndefined();
    expect(result.length).toBe(SAMPLE_LIBRARY_ITEMS.length - 2);
  });
});

describe('getPoolCountWithBreakdown parity', () => {
  const dataStats = computeDataStats(SAMPLE_LIBRARY_ITEMS);

  it('matches applyFullFilters count for genre filter', () => {
    const filters = { ...DEFAULT_FILTERS, genres: ['Drama'] };
    const watchedIds = new Set<string>();
    const full = applyFullFilters(SAMPLE_LIBRARY_ITEMS, filters, watchedIds, null);
    const pool = getPoolCountWithBreakdown(
      SAMPLE_LIBRARY_ITEMS,
      filters,
      watchedIds,
      dataStats,
      null
    );
    expect(pool.matchingCount).toBe(full.length);
  });

  it('matches applyFullFilters count for unwatched filter', () => {
    const filters = { ...DEFAULT_FILTERS, unwatchedOnly: true };
    const watchedIds = new Set(['1', '2']);
    const full = applyFullFilters(SAMPLE_LIBRARY_ITEMS, filters, watchedIds, null);
    const pool = getPoolCountWithBreakdown(
      SAMPLE_LIBRARY_ITEMS,
      filters,
      watchedIds,
      dataStats,
      null
    );
    expect(pool.matchingCount).toBe(full.length);
  });

  it('reports emptyReason when genre filter empties pool', () => {
    const filters = { ...DEFAULT_FILTERS, genres: ['Western'] };
    const pool = getPoolCountWithBreakdown(
      SAMPLE_LIBRARY_ITEMS,
      filters,
      new Set(),
      dataStats,
      null
    );
    expect(pool.matchingCount).toBe(0);
    expect(pool.emptyReason).toMatch(/genres/i);
    expect(pool.breakdown.some((b) => b.causedEmpty)).toBe(true);
  });

  it('filters by collection membership', () => {
    const collectionIds = new Set(['1', '3']);
    const full = applyFullFilters(
      SAMPLE_LIBRARY_ITEMS,
      DEFAULT_FILTERS,
      new Set(),
      collectionIds
    );
    expect(full).toHaveLength(2);
  });
});
