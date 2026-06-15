'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  selectionApi,
  spinHistoryApi,
  SpinHistoryEntry,
  authApi,
  AnimationStyle,
  AnimationSpeed,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Header from '@/components/Header';
import SpinControls from '@/components/SpinControls';
import SpinAnimationPlayer from '@/components/SpinAnimationPlayer';
import MovieCard from '@/components/MovieCard';
import LibrarySelector from '@/components/LibrarySelector';
import FilterPanel from '@/components/FilterPanel';
import LoadingSpinner from '@/components/LoadingSpinner';
import RecentSpins, { historyFiltersToFilters } from '@/components/RecentSpins';
import {
  resolveAnimationStyle,
  ResolvedAnimationStyle,
  PlexItem,
} from '@/components/animations';

import { Filters, DEFAULT_FILTERS, PoolCountResult } from '@/types/filters';

type SpinPhase = 'idle' | 'loading' | 'animating' | 'result';

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
  const [phase, setPhase] = useState<SpinPhase>('idle');
  const [pendingResult, setPendingResult] = useState<SelectionResult | null>(null);
  const [activeVariant, setActiveVariant] = useState<ResolvedAnimationStyle>('slots');
  const [result, setResult] = useState<SelectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalMatches: number } | null>(null);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [dataStats, setDataStats] = useState<PoolCountResult['dataStats'] | null>(null);
  const [loadingPoolCount, setLoadingPoolCount] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [tvSelectionMode, setTvSelectionMode] = useState<'show' | 'episode'>('show');
  const [overseerrWarning, setOverseerrWarning] = useState<string | null>(null);
  const [animationStyle, setAnimationStyle] = useState<AnimationStyle>('slots');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('normal');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    authApi
      .getCurrentUser()
      .then(({ preferences }) => {
        setAnimationStyle(preferences.animationStyle ?? 'slots');
        setAnimationSpeed(preferences.animationSpeed ?? 'normal');
        setTvSelectionMode(preferences.tvSelectionMode ?? 'show');
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    const handlePreferencesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        animationStyle?: AnimationStyle;
        animationSpeed?: AnimationSpeed;
      }>).detail;

      if (detail?.animationStyle) {
        setAnimationStyle(detail.animationStyle);
      }
      if (detail?.animationSpeed) {
        setAnimationSpeed(detail.animationSpeed);
      }
    };

    window.addEventListener('decidarr:preferences-updated', handlePreferencesUpdated);
    return () => window.removeEventListener('decidarr:preferences-updated', handlePreferencesUpdated);
  }, []);

  useEffect(() => {
    if (selectedLibraries.length === 0) {
      setPoolCount(null);
      setTotalItems(0);
      setEmptyReason(null);
      setDataStats(null);
      setOverseerrWarning(null);
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
        setOverseerrWarning(data.overseerrWarning ?? null);
      } catch (err) {
        console.error('Failed to fetch pool count:', err);
        setPoolCount(null);
      } finally {
        setLoadingPoolCount(false);
      }
    };

    const timeoutId = setTimeout(fetchPoolCount, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedLibraries, mediaType, filters]);

  const handleSpin = useCallback(async () => {
    if (selectedLibraries.length === 0) return;

    setPhase('loading');
    setError(null);
    setResult(null);
    setPendingResult(null);

    const variant = resolveAnimationStyle(animationStyle);
    setActiveVariant(variant);

    try {
      const data = await selectionApi.getRandom(
        selectedLibraries,
        mediaType,
        filters,
        mediaType === 'show' ? tvSelectionMode : undefined
      );

      setPendingResult(data as SelectionResult);
      setStats(data.stats);

      const selection = (data as SelectionResult).selection;
      spinHistoryApi
        .create({
          plexId: selection.plexId,
          title: selection.title,
          mediaType: (selection.type as 'movie' | 'show' | 'episode') || 'movie',
          posterUrl: typeof selection.posterUrl === 'string' ? selection.posterUrl : undefined,
          year: typeof selection.year === 'number' ? selection.year : undefined,
          libraryIds: selectedLibraries,
          filtersSnapshot: filters,
          tvSelectionMode: mediaType === 'show' ? tvSelectionMode : undefined,
          poolSizeAtSpin: data.stats?.totalMatches,
        })
        .then(() => setHistoryRefreshKey((k) => k + 1))
        .catch((historyErr) => console.error('Failed to record spin history:', historyErr));
      setPhase('animating');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      if (errorMessage.includes('No items')) {
        setError('No items found matching your criteria');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setPhase('idle');
    }
  }, [selectedLibraries, mediaType, filters, tvSelectionMode, animationStyle]);

  const handleReapplyHistory = useCallback((entry: SpinHistoryEntry) => {
    if (entry.libraryIds?.length) {
      setSelectedLibraries(entry.libraryIds);
    }
    if (entry.mediaType === 'movie' || entry.mediaType === 'show' || entry.mediaType === 'episode') {
      setMediaType(entry.mediaType === 'episode' ? 'show' : entry.mediaType);
    }
    if (entry.tvSelectionMode) {
      setTvSelectionMode(entry.tvSelectionMode);
    }
    const restoredFilters = historyFiltersToFilters(entry.filtersSnapshot);
    if (restoredFilters) {
      setFilters(restoredFilters);
    }
    setResult(null);
  }, []);

  const handleRevisitHistory = useCallback((entry: SpinHistoryEntry) => {
    setResult({
      selection: {
        plexId: entry.plexId,
        title: entry.title,
        type: entry.mediaType,
        year: entry.year,
        posterUrl: entry.posterUrl,
      },
      playLinks: null,
      stats: { totalMatches: entry.poolSizeAtSpin ?? 0 },
    });
    setPhase('result');
  }, []);

  const handleAnimationComplete = useCallback(() => {
    if (pendingResult) {
      setResult(pendingResult);
      setPendingResult(null);
    }
    setPhase('result');
  }, [pendingResult]);

  const handleMediaTypeChange = useCallback((type: string) => {
    setMediaType(type);
    setSelectedLibraries([]);
    setResult(null);
    setPhase('idle');
    setFilters(DEFAULT_FILTERS);
  }, []);

  const handleSpinAgain = useCallback(() => {
    setResult(null);
    setPhase('idle');
    handleSpin();
  }, [handleSpin]);

  const spinDisabled =
    selectedLibraries.length === 0 || loadingPoolCount || poolCount === 0;

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
                overseerrWarning={overseerrWarning}
              />

              {stats && (
                <div className="bg-decidarr-secondary rounded-xl p-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Pool Stats</h3>
                  <p className="text-white">
                    <span className="text-decidarr-primary font-bold">{stats.totalMatches}</span>{' '}
                    matching items
                  </p>
                </div>
              )}

              <RecentSpins
                refreshKey={historyRefreshKey}
                onReapply={handleReapplyHistory}
                onRevisit={handleRevisitHistory}
              />
            </div>

            <div className="lg:col-span-2">
              <AnimatePresence mode="wait">
                {phase === 'result' && result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
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

                    <MovieCard
                      item={result.selection as Parameters<typeof MovieCard>[0]['item']}
                      tmdb={result.selection.tmdb as Parameters<typeof MovieCard>[0]['tmdb']}
                      isWatched={false}
                      onWatchedChange={() => {}}
                      playLinks={result.playLinks}
                    />

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
                        onClick={() => {
                          setResult(null);
                          setPhase('idle');
                        }}
                        className="px-6 py-3 bg-decidarr-secondary text-white
                               font-semibold rounded-lg hover:bg-white/10
                               transition-colors border border-gray-700"
                      >
                        Back to Machine
                      </button>
                    </div>
                  </motion.div>
                ) : phase === 'animating' && pendingResult ? (
                  <motion.div
                    key="animating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center min-h-[500px]"
                  >
                    <SpinAnimationPlayer
                      variant={activeVariant}
                      result={pendingResult.selection as PlexItem}
                      speed={animationSpeed}
                      onComplete={handleAnimationComplete}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="controls"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center min-h-[500px]"
                  >
                    <SpinControls
                      onSpin={handleSpin}
                      loading={phase === 'loading'}
                      disabled={spinDisabled || phase === 'loading'}
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

                    {selectedLibraries.length > 0 && phase === 'idle' && !error && (
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
