'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { selectionApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import SlotMachine from '@/components/SlotMachine';
import MovieCard from '@/components/MovieCard';
import LibrarySelector from '@/components/LibrarySelector';
import FilterPanel from '@/components/FilterPanel';
import LoadingSpinner from '@/components/LoadingSpinner';

import { Filters, DEFAULT_FILTERS, PoolCountResult } from '@/types/filters';

interface SelectionResult {
  selection: {
    plexId: string;
    title: string;
    type: string;
    tmdb?: unknown;
    [key: string]: unknown;
  };
  playLinks?: {
    web: string;
    app: string;
    ios: string;
    android: string;
    machineId: string | null;
  } | null;
  stats: {
    totalMatches: number;
  };
}

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState('movie');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalMatches: number } | null>(null);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [dataStats, setDataStats] = useState<PoolCountResult['dataStats'] | null>(null);
  const [loadingPoolCount, setLoadingPoolCount] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      console.log('[Dashboard] Not authenticated, redirecting to home');
      router.replace('/');
    }
  }, [isAuthenticated, authLoading, router]);

  // Fetch pool count when libraries or filters change
  useEffect(() => {
    if (selectedLibraries.length === 0) {
      setPoolCount(null);
      setTotalItems(0);
      setEmptyReason(null);
      setDataStats(null);
      return;
    }

    const fetchPoolCount = async () => {
      setLoadingPoolCount(true);
      try {
        const data = await selectionApi.getPoolCount(selectedLibraries, mediaType, filters);
        setPoolCount(data.matchingItems);
        setTotalItems(data.totalItems);
        setEmptyReason(data.emptyReason);
        setDataStats(data.dataStats);
      } catch (err) {
        console.error('Failed to fetch pool count:', err);
        setPoolCount(null);
      } finally {
        setLoadingPoolCount(false);
      }
    };

    // Debounce the fetch to avoid too many requests
    const timeoutId = setTimeout(fetchPoolCount, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedLibraries, mediaType, filters]);

  const handleSpin = useCallback(async () => {
    if (selectedLibraries.length === 0) return;

    setSpinning(true);
    setError(null);
    setResult(null);

    const minSpinTime = 2000;
    const startTime = Date.now();

    try {
      const data = await selectionApi.getRandom(
        selectedLibraries,
        mediaType,
        filters,
        mediaType === 'show' ? 'show' : undefined
      );

      const elapsed = Date.now() - startTime;
      if (elapsed < minSpinTime) {
        await new Promise((resolve) => setTimeout(resolve, minSpinTime - elapsed));
      }

      setResult(data as SelectionResult);
      setStats(data.stats);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      if (elapsed < minSpinTime) {
        await new Promise((resolve) => setTimeout(resolve, minSpinTime - elapsed));
      }

      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      if (errorMessage.includes('No items')) {
        setError('No items found matching your criteria');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSpinning(false);
    }
  }, [selectedLibraries, mediaType, filters]);

  const handleMediaTypeChange = useCallback((type: string) => {
    setMediaType(type);
    setSelectedLibraries([]);
    setResult(null);
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleSpinAgain = useCallback(() => {
    setResult(null);
    handleSpin();
  }, [handleSpin]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-decidarr-dark">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-decidarr-dark">
      <Header />
      <div className="min-h-screen pb-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left sidebar - Controls */}
            <div className="lg:col-span-1 space-y-4">
              <LibrarySelector
                selectedLibraries={selectedLibraries}
                onSelect={setSelectedLibraries}
                mediaType={mediaType}
                onMediaTypeChange={handleMediaTypeChange}
              />

              <FilterPanel
                libraryIds={selectedLibraries}
                filters={filters}
                onFiltersChange={setFilters}
                poolCount={poolCount}
                totalItems={totalItems}
                emptyReason={emptyReason}
                dataStats={dataStats}
                loadingPoolCount={loadingPoolCount}
              />

              {/* Stats */}
              {stats && (
                <div className="bg-decidarr-secondary rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Pool Stats</h3>
                  <p className="text-white">
                    <span className="text-decidarr-primary font-bold">{stats.totalMatches}</span>{' '}
                    matching items
                  </p>
                </div>
              )}
            </div>

            {/* Main content - Slot Machine and Results */}
            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
                    {/* Result header */}
                    <div className="text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-4xl mb-2"
                      >
                        🎉
                      </motion.div>
                      <h2 className="text-xl font-semibold text-white">
                        Your fate has been decided!
                      </h2>
                    </div>

                    {/* Movie Card */}
                    <MovieCard
                      item={result.selection as Parameters<typeof MovieCard>[0]['item']}
                      tmdb={result.selection.tmdb as Parameters<typeof MovieCard>[0]['tmdb']}
                      isWatched={false}
                      onWatchedChange={() => {}}
                      playLinks={result.playLinks}
                    />

                    {/* Actions */}
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={handleSpinAgain}
                        className="px-6 py-3 bg-decidarr-primary text-decidarr-dark
                               font-semibold rounded-lg hover:bg-decidarr-accent
                               transition-colors"
                      >
                        Spin Again
                      </button>
                      <button
                        onClick={() => setResult(null)}
                        className="px-6 py-3 bg-decidarr-secondary text-white
                               font-semibold rounded-lg hover:bg-white/10
                               transition-colors border border-gray-700"
                      >
                        Back to Machine
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="machine"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center min-h-[500px]"
                  >
                    <SlotMachine
                      onSpin={handleSpin}
                      spinning={spinning}
                      disabled={selectedLibraries.length === 0 || loadingPoolCount || poolCount === 0}
                      disabledReason={
                        selectedLibraries.length === 0
                          ? 'no_library'
                          : loadingPoolCount
                            ? 'loading'
                            : poolCount === 0
                              ? 'empty_pool'
                              : undefined
                      }
                      poolCount={poolCount}
                    />

                    {/* Error message */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="mt-6 bg-decidarr-error/20 border border-decidarr-error
                                 rounded-lg p-4 max-w-md text-center"
                        >
                          <p className="text-decidarr-error">{error}</p>
                          <button
                            onClick={() => setError(null)}
                            className="mt-2 text-sm text-gray-400 hover:text-white"
                          >
                            Dismiss
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Helper text */}
                    {selectedLibraries.length > 0 && !spinning && !error && (
                      <p className="mt-6 text-gray-400 text-center max-w-md">
                        {selectedLibraries.length}{' '}
                        {selectedLibraries.length === 1 ? 'library' : 'libraries'} selected. Hit{' '}
                        <span className="text-decidarr-primary font-semibold">SPIN</span> and let
                        fate decide what you watch!
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
