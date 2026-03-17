'use client';

import { useState, useEffect } from 'react';
import { libraryApi, selectionApi, PlexCollection } from '@/lib/api';
import { Filters, DataStats } from '@/types/filters';

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
}

function getRatingIcon(icon: string): string {
  const icons: Record<string, string> = {
    oscar: '🏆',
    emmy: '📺',
    camera: '🎬',
    popcorn: '🍿',
    masks: '💎',
    star: '⭐',
  };
  return icons[icon] || '🏅';
}

export default function FilterPanel({
  libraryIds,
  filters,
  onFiltersChange,
  poolCount,
  totalItems,
  emptyReason,
  dataStats,
  loadingPoolCount,
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
  const [studioTab, setStudioTab] = useState<'streaming' | 'anime' | 'traditional' | 'library'>('streaming');

  // Load static options (rating categories, popular studios)
  useEffect(() => {
    loadStaticOptions();
  }, []);

  // Load library-specific options when libraries change
  useEffect(() => {
    if (libraryIds.length > 0) {
      loadLibraryOptions();
    } else {
      // Reset filter options when no libraries selected
      setFilterOptions({
        contentRatings: [],
        hasRatings: false,
        ratingRange: { min: 0, max: 10 },
        studios: [],
      });
      setGenres([]);
    }
  }, [libraryIds]);

  const loadStaticOptions = async () => {
    try {
      const [ratingsRes, studiosRes] = await Promise.all([
        selectionApi.getAwardCategories(),
        libraryApi.getStudios(),
      ]);

      setRatingCategories(ratingsRes.categories || []);
      setPopularStudios(studiosRes.studios || { streaming: [], anime: [], traditional: [] });
    } catch (err) {
      console.error('Failed to load static filter options:', err);
    }
  };

  const loadLibraryOptions = async () => {
    try {
      const [genresRes, yearsRes, filterOptionsRes, collectionsRes] = await Promise.all([
        libraryApi.getGenres(libraryIds),
        libraryApi.getYears(libraryIds),
        libraryApi.getFilterOptions(libraryIds),
        libraryApi.getCollections(libraryIds),
      ]);

      setGenres(genresRes.genres || []);
      setYearRange(yearsRes);
      setFilterOptions(filterOptionsRes);
      setCollections(collectionsRes.collections || []);
    } catch (err) {
      console.error('Failed to load library filter options:', err);
    }
  };

  const toggleGenre = (genre: string) => {
    const currentGenres = filters.genres;
    const newGenres = currentGenres.includes(genre)
      ? currentGenres.filter((g) => g !== genre)
      : [...currentGenres, genre];
    onFiltersChange({ ...filters, genres: newGenres });
  };

  const updateYearRange = (key: 'start' | 'end', value: string) => {
    const current = filters.yearRange || { start: yearRange.min, end: yearRange.max };
    onFiltersChange({
      ...filters,
      yearRange: { ...current, [key]: parseInt(value) || null },
    });
  };

  const toggleContentRating = (rating: string) => {
    const current = filters.contentRatings;
    const newRatings = current.includes(rating)
      ? current.filter((r) => r !== rating)
      : [...current, rating];
    onFiltersChange({ ...filters, contentRatings: newRatings });
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

  const toggleStudio = (studio: string) => {
    const currentStudios = filters.studios;
    const newStudios = currentStudios.includes(studio)
      ? currentStudios.filter((s) => s !== studio)
      : [...currentStudios, studio];
    onFiltersChange({ ...filters, studios: newStudios });
  };

  const toggleUnwatched = () => {
    onFiltersChange({ ...filters, unwatchedOnly: !filters.unwatchedOnly });
  };

  const toggleCollection = (ratingKey: string) => {
    const current = filters.collections || [];
    const newCollections = current.includes(ratingKey)
      ? current.filter((c) => c !== ratingKey)
      : [...current, ratingKey];
    onFiltersChange({ ...filters, collections: newCollections });
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

  // Get current studio list based on tab
  const getCurrentStudios = () => {
    if (studioTab === 'library') return filterOptions.studios;
    return popularStudios[studioTab] || [];
  };

  const currentStudios = getCurrentStudios();

  // Check if we have libraries selected (to show library-specific filters)
  const hasLibraries = libraryIds.length > 0;

  // Calculate data availability percentages
  const getDataAvailability = (field: keyof DataStats): number | null => {
    if (!dataStats || !totalItems || totalItems === 0) return null;
    return Math.round((dataStats[field] / totalItems) * 100);
  };

  const ratingAvailability = getDataAvailability('itemsWithRating');
  const contentRatingAvailability = getDataAvailability('itemsWithContentRating');
  const studioAvailability = getDataAvailability('itemsWithStudio');

  return (
    <div className="bg-decidarr-secondary rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
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
        <div className="p-4 pt-0 space-y-4">
          {/* Pool Count Display */}
          {hasLibraries && (
            <div className={`p-3 rounded-lg ${
              loadingPoolCount
                ? 'bg-gray-700/50'
                : poolCount === 0
                  ? 'bg-red-900/30 border border-red-700/50'
                  : 'bg-green-900/30 border border-green-700/50'
            }`}>
              {loadingPoolCount ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <span className="animate-pulse">Calculating...</span>
                </div>
              ) : poolCount === 0 ? (
                <div className="text-sm">
                  <div className="flex items-center gap-2 text-red-400 font-medium">
                    <span>No items match your filters</span>
                  </div>
                  {emptyReason && (
                    <p className="text-red-300/70 text-xs mt-1">{emptyReason}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-green-400">
                    <span className="font-bold">{poolCount}</span>
                    {totalItems && poolCount !== totalItems && (
                      <span className="text-green-400/70"> / {totalItems}</span>
                    )}
                    <span className="ml-1">items match</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Unwatched Only */}
          <div>
            <button
              onClick={toggleUnwatched}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition ${
                filters.unwatchedOnly
                  ? 'bg-decidarr-primary/20 border-2 border-decidarr-primary'
                  : 'bg-decidarr-dark border-2 border-transparent'
              }`}
            >
              <span className="text-white">Only show unwatched</span>
              {filters.unwatchedOnly && <span className="text-decidarr-primary">✓</span>}
            </button>
          </div>

          {/* Collections Filter - Kometa collections */}
          {collections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Collections
                {(filters.collections || []).length > 0 && (
                  <span className="ml-2 text-decidarr-primary">({filters.collections?.length})</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {collections.map((collection) => (
                  <button
                    key={collection.ratingKey}
                    onClick={() => toggleCollection(collection.ratingKey)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      (filters.collections || []).includes(collection.ratingKey)
                        ? 'bg-decidarr-primary text-decidarr-dark'
                        : 'bg-decidarr-dark text-gray-300 hover:text-white'
                    }`}
                    title={`${collection.childCount} items`}
                  >
                    {collection.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Genre Filter - only show if genres available */}
          {genres.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Genres
                {filters.genres.length > 0 && (
                  <span className="ml-2 text-decidarr-primary">({filters.genres.length})</span>
                )}
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      filters.genres.includes(genre)
                        ? 'bg-decidarr-primary text-decidarr-dark'
                        : 'bg-decidarr-dark text-gray-300 hover:text-white'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content Rating Filter - only show if content ratings available */}
          {filterOptions.contentRatings.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Age Rating
                {filters.contentRatings.length > 0 && (
                  <span className="ml-2 text-decidarr-primary">({filters.contentRatings.length})</span>
                )}
                {contentRatingAvailability !== null && contentRatingAvailability < 50 && (
                  <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with age rating data">
                    ({contentRatingAvailability}% have data)
                  </span>
                )}
              </label>
              <div className="flex flex-wrap gap-2">
                {filterOptions.contentRatings.map((rating) => (
                  <button
                    key={rating}
                    onClick={() => toggleContentRating(rating)}
                    className={`px-3 py-1 rounded-full text-sm transition ${
                      filters.contentRatings.includes(rating)
                        ? 'bg-decidarr-primary text-decidarr-dark'
                        : 'bg-decidarr-dark text-gray-300 hover:text-white'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Year Range - only show if libraries selected */}
          {hasLibraries && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Year Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={String(yearRange.min)}
                  value={filters.yearRange?.start || ''}
                  onChange={(e) => updateYearRange('start', e.target.value)}
                  className="w-24 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                           text-white text-center focus:border-decidarr-primary outline-none"
                />
                <span className="text-gray-500">to</span>
                <input
                  type="number"
                  placeholder={String(yearRange.max)}
                  value={filters.yearRange?.end || ''}
                  onChange={(e) => updateYearRange('end', e.target.value)}
                  className="w-24 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                           text-white text-center focus:border-decidarr-primary outline-none"
                />
              </div>
            </div>
          )}

          {/* Rating Filter - only show if items have ratings */}
          {filterOptions.hasRatings && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Score Rating
                {ratingAvailability !== null && ratingAvailability < 50 && (
                  <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with rating data">
                    ({ratingAvailability}% have data)
                  </span>
                )}
              </label>

              {/* Preset options */}
              <div className="grid grid-cols-1 gap-2 mb-3">
                {ratingCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => toggleRatingFilter(category.id)}
                    className={`p-2 rounded-lg text-sm text-left transition flex items-center gap-2 ${
                      filters.ratingFilter === category.id
                        ? 'bg-decidarr-primary/20 border-2 border-decidarr-primary'
                        : 'bg-decidarr-dark border-2 border-transparent hover:border-gray-700'
                    }`}
                  >
                    <span>{getRatingIcon(category.icon)}</span>
                    <span className="text-white text-xs">{category.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom range */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={filterOptions.ratingRange.min}
                  max={filterOptions.ratingRange.max}
                  placeholder={String(filterOptions.ratingRange.min)}
                  value={filters.ratingRange?.min ?? ''}
                  onChange={(e) => updateRatingRange('min', e.target.value)}
                  className="w-20 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                           text-white text-center focus:border-decidarr-primary outline-none text-sm"
                />
                <span className="text-gray-500 text-sm">to</span>
                <input
                  type="number"
                  step="0.5"
                  min={filterOptions.ratingRange.min}
                  max={filterOptions.ratingRange.max}
                  placeholder={String(filterOptions.ratingRange.max)}
                  value={filters.ratingRange?.max ?? ''}
                  onChange={(e) => updateRatingRange('max', e.target.value)}
                  className="w-20 px-3 py-2 bg-decidarr-dark border border-gray-700 rounded-lg
                           text-white text-center focus:border-decidarr-primary outline-none text-sm"
                />
                <span className="text-gray-500 text-xs">/ 10</span>
              </div>
            </div>
          )}

          {/* Studio Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Studios / Networks
              {filters.studios.length > 0 && (
                <span className="ml-2 text-decidarr-primary">({filters.studios.length})</span>
              )}
              {studioAvailability !== null && studioAvailability < 50 && (
                <span className="ml-2 text-yellow-500 text-xs" title="Percentage of items with studio/network data">
                  ({studioAvailability}% have data)
                </span>
              )}
            </label>

            {/* Studio Tabs */}
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setStudioTab('streaming')}
                className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
                  studioTab === 'streaming'
                    ? 'bg-decidarr-primary text-decidarr-dark'
                    : 'bg-decidarr-dark text-gray-400 hover:text-white'
                }`}
              >
                Streaming
              </button>
              <button
                onClick={() => setStudioTab('anime')}
                className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
                  studioTab === 'anime'
                    ? 'bg-decidarr-primary text-decidarr-dark'
                    : 'bg-decidarr-dark text-gray-400 hover:text-white'
                }`}
              >
                Anime
              </button>
              <button
                onClick={() => setStudioTab('traditional')}
                className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
                  studioTab === 'traditional'
                    ? 'bg-decidarr-primary text-decidarr-dark'
                    : 'bg-decidarr-dark text-gray-400 hover:text-white'
                }`}
              >
                Studios
              </button>
              {filterOptions.studios.length > 0 && (
                <button
                  onClick={() => setStudioTab('library')}
                  className={`flex-1 py-1.5 px-2 text-xs rounded-lg transition ${
                    studioTab === 'library'
                      ? 'bg-decidarr-primary text-decidarr-dark'
                      : 'bg-decidarr-dark text-gray-400 hover:text-white'
                  }`}
                >
                  In Library
                </button>
              )}
            </div>

            {/* Studio List */}
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {currentStudios.length > 0 ? (
                currentStudios.map((studio) => (
                  <button
                    key={studio}
                    onClick={() => toggleStudio(studio)}
                    className={`px-3 py-1 rounded-full text-xs transition ${
                      filters.studios.includes(studio)
                        ? 'bg-decidarr-primary text-decidarr-dark'
                        : 'bg-decidarr-dark text-gray-300 hover:text-white'
                    }`}
                  >
                    {studio}
                  </button>
                ))
              ) : (
                <p className="text-gray-500 text-xs py-2">
                  {studioTab === 'library' ? 'No studios found in selected libraries' : 'No studios available'}
                </p>
              )}
            </div>
          </div>

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
