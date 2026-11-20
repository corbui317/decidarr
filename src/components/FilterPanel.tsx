'use client';

import { useState, useEffect, useMemo } from 'react';
import { libraryApi, selectionApi, PlexCollection } from '@/lib/api';
import { Filters, DataStats } from '@/types/filters';
import PoolCountDisplay from './filters/PoolCountDisplay';
import QuickFilters from './filters/QuickFilters';
import CollectionsFilter from './filters/CollectionsFilter';
import GenresFilter from './filters/GenresFilter';
import YearRangeFilter from './filters/YearRangeFilter';
import RatingFilter from './filters/RatingFilter';
import ContentRatingFilter from './filters/ContentRatingFilter';
import StudiosFilter from './filters/StudiosFilter';

interface RatingCategory {
  id: string;
  name: string;
  icon: string;
}

interface Studios {
  streaming: string[];
  anime: string[];
  traditional: string[];
}

interface FilterOptions {
  contentRatings: string[];
  hasRatings: boolean;
  ratingRange: { min: number; max: number };
  studios: string[];
}

interface FilterPanelProps {
  libraryIds: string[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  poolCount?: number | null;
  totalItems?: number;
  emptyReason?: string | null;
  dataStats?: DataStats | null;
  loadingPoolCount?: boolean;
  overseerrWarning?: string | null;
}

// Minimum percentage of items that must have data for a filter to be shown
const MIN_DATA_THRESHOLD = 10;

export default function FilterPanel({
  libraryIds,
  filters,
  onFiltersChange,
  poolCount,
  totalItems,
  emptyReason,
  dataStats,
  loadingPoolCount,
  overseerrWarning,
}: FilterPanelProps) {
  const [genres, setGenres] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState({ min: 1900, max: new Date().getFullYear() });
  const [ratingCategories, setRatingCategories] = useState<RatingCategory[]>([]);
  const [popularStudios, setPopularStudios] = useState<Studios>({ streaming: [], anime: [], traditional: [] });
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    contentRatings: [],
    hasRatings: false,
    ratingRange: { min: 0, max: 10 },
    studios: [],
  });
  const [collections, setCollections] = useState<PlexCollection[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Load static options (rating categories, popular studios)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ratingsRes, studiosRes] = await Promise.all([
          selectionApi.getAwardCategories(),
          libraryApi.getStudios(),
        ]);
        if (cancelled) return;
        setRatingCategories(ratingsRes.categories || []);
        setPopularStudios(studiosRes.studios || { streaming: [], anime: [], traditional: [] });
      } catch {
        // Error loading filter options; filters will remain empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load library-specific options when libraries change; a response for a
  // previous selection is dropped so it cannot overwrite the current one.
  useEffect(() => {
    if (libraryIds.length === 0) {
      setFilterOptions({
        contentRatings: [],
        hasRatings: false,
        ratingRange: { min: 0, max: 10 },
        studios: [],
      });
      setGenres([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const [genresRes, yearsRes, filterOptionsRes, collectionsRes] = await Promise.all([
          libraryApi.getGenres(libraryIds),
          libraryApi.getYears(libraryIds),
          libraryApi.getFilterOptions(libraryIds),
          libraryApi.getCollections(libraryIds),
        ]);
        if (cancelled) return;
        setGenres(genresRes.genres || []);
        setYearRange(yearsRes);
        setFilterOptions(filterOptionsRes);
        setCollections(collectionsRes.collections || []);
      } catch {
        // Error loading filter options; filters will remain empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [libraryIds]);

  // Shared helper for toggling array filters
  const toggleArrayItem = <K extends 'genres' | 'contentRatings' | 'studios' | 'collections'>(
    key: K,
    item: string
  ) => {
    const currentArray = (filters[key] as string[]) || [];
    const newArray = currentArray.includes(item)
      ? currentArray.filter((i) => i !== item)
      : [...currentArray, item];
    onFiltersChange({ ...filters, [key]: newArray });
  };

  const toggleGenre = (genre: string) => toggleArrayItem('genres', genre);
  const toggleContentRating = (rating: string) => toggleArrayItem('contentRatings', rating);
  const toggleStudio = (studio: string) => toggleArrayItem('studios', studio);
  const toggleCollection = (ratingKey: string) => toggleArrayItem('collections', ratingKey);

  const updateYearRange = (key: 'start' | 'end', value: string) => {
    const current = filters.yearRange || { start: yearRange.min, end: yearRange.max };
    onFiltersChange({
      ...filters,
      yearRange: { ...current, [key]: parseInt(value) || null },
    });
  };

  const updateRatingRange = (key: 'min' | 'max', value: string) => {
    const current = filters.ratingRange || { min: filterOptions.ratingRange.min, max: filterOptions.ratingRange.max };
    const numValue = parseFloat(value);
    onFiltersChange({
      ...filters,
      ratingRange: { ...current, [key]: isNaN(numValue) ? null : numValue },
      ratingFilter: null, // Clear preset when using custom range
    });
  };

  const toggleRatingFilter = (ratingId: string) => {
    onFiltersChange({
      ...filters,
      ratingFilter: filters.ratingFilter === ratingId ? null : ratingId,
      ratingRange: null, // Clear custom range when using preset
    });
  };

  const toggleUnwatched = () => {
    onFiltersChange({ ...filters, unwatchedOnly: !filters.unwatchedOnly });
  };

  const clearFilters = () => {
    onFiltersChange({
      genres: [],
      yearRange: null,
      contentRatings: [],
      studios: [],
      ratingRange: null,
      ratingFilter: null,
      unwatchedOnly: false,
      collections: [],
    });
  };

  const activeFilterCount = [
    filters.genres.length > 0,
    filters.yearRange?.start || filters.yearRange?.end,
    filters.contentRatings.length > 0,
    filters.studios.length > 0,
    filters.ratingRange?.min !== undefined || filters.ratingRange?.max !== undefined,
    filters.ratingFilter,
    filters.unwatchedOnly,
    (filters.collections || []).length > 0,
  ].filter(Boolean).length;

  // Check if we have libraries selected (to show library-specific filters)
  const hasLibraries = libraryIds.length > 0;

  // Data availability percentages per field, recalculated only when the stats change
  const dataAvailability = useMemo(() => {
    const percent = (field: keyof DataStats): number => {
      if (!dataStats || !totalItems) return 0;
      return Math.round((dataStats[field] / totalItems) * 100);
    };
    return {
      rating: percent('itemsWithRating'),
      contentRating: percent('itemsWithContentRating'),
      studio: percent('itemsWithStudio'),
      year: percent('itemsWithYear'),
      genres: percent('itemsWithGenres'),
    };
  }, [dataStats, totalItems]);

  // Determine which filters should be shown based on data availability
  const showRatingFilter = filterOptions.hasRatings && dataAvailability.rating >= MIN_DATA_THRESHOLD;
  const showContentRatingFilter = filterOptions.contentRatings.length > 0 && dataAvailability.contentRating >= MIN_DATA_THRESHOLD;
  const showStudioFilter = (filterOptions.studios.length > 0 || popularStudios.streaming.length > 0) && dataAvailability.studio >= MIN_DATA_THRESHOLD;
  const showYearFilter = hasLibraries && dataAvailability.year >= MIN_DATA_THRESHOLD;
  const showGenreFilter = genres.length > 0 && dataAvailability.genres >= MIN_DATA_THRESHOLD;

  return (
    <div className="bg-decidarr-secondary rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="filter-panel-content"
        className="touch-target w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <span className="font-semibold text-white">Filters</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-decidarr-primary text-decidarr-dark text-xs rounded-full font-medium">
              {activeFilterCount}
            </span>
          )}
        </div>
        <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div id="filter-panel-content" className="p-4 pt-0 space-y-4">
          {overseerrWarning && (
            <div
              role="status"
              className="p-3 rounded-lg bg-amber-900/30 border border-amber-700/50 text-amber-200 text-sm"
            >
              {overseerrWarning}
            </div>
          )}

          {/* Pool Count Display */}
          {hasLibraries && (
            <PoolCountDisplay
              poolCount={poolCount}
              totalItems={totalItems}
              emptyReason={emptyReason}
              loadingPoolCount={loadingPoolCount}
            />
          )}

          {/* 1. QUICK FILTERS - Always shown at top */}
          <QuickFilters
            unwatchedOnly={filters.unwatchedOnly}
            onToggleUnwatched={toggleUnwatched}
          />

          {/* 2. COLLECTIONS - Most useful for curated lists (Kometa) */}
          <CollectionsFilter
            collections={collections}
            selectedCollections={filters.collections || []}
            onToggleCollection={toggleCollection}
          />

          {/* 3. GENRES - Very commonly used filter */}
          {showGenreFilter && (
            <GenresFilter
              genres={genres}
              selectedGenres={filters.genres}
              onToggleGenre={toggleGenre}
            />
          )}

          {/* 4. YEAR RANGE - Commonly used */}
          {showYearFilter && (
            <YearRangeFilter
              yearRange={yearRange}
              selectedYearRange={filters.yearRange}
              onUpdateYearRange={updateYearRange}
            />
          )}

          {/* 5. SCORE RATING - Only if sufficient data */}
          {showRatingFilter && (
            <RatingFilter
              ratingCategories={ratingCategories}
              ratingRange={filterOptions.ratingRange}
              selectedRatingFilter={filters.ratingFilter}
              selectedRatingRange={filters.ratingRange}
              dataAvailability={dataAvailability.rating}
              onToggleRatingFilter={toggleRatingFilter}
              onUpdateRatingRange={updateRatingRange}
            />
          )}

          {/* 6. AGE RATING - Only if sufficient data */}
          {showContentRatingFilter && (
            <ContentRatingFilter
              contentRatings={filterOptions.contentRatings}
              selectedContentRatings={filters.contentRatings}
              dataAvailability={dataAvailability.contentRating}
              onToggleContentRating={toggleContentRating}
            />
          )}

          {/* 7. STUDIOS/NETWORKS - Only if sufficient data */}
          {showStudioFilter && (
            <StudiosFilter
              popularStudios={popularStudios}
              libraryStudios={filterOptions.studios}
              selectedStudios={filters.studios}
              dataAvailability={dataAvailability.studio}
              onToggleStudio={toggleStudio}
            />
          )}

          {/* Clear Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="w-full py-2 text-gray-400 hover:text-white transition text-sm"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
