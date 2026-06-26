'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  authApi,
  watchedApi,
  SpinHistoryEntry,
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
import { PlexItem } from '@/components/animations';
import { Filters, DEFAULT_FILTERS } from '@/types/filters';
import { usePoolCount } from '@/hooks/usePoolCount';
import { useSpinFlow } from '@/hooks/useSpinFlow';
import type { SelectionResultResponse } from '@/types/api/selection';

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState('movie');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [tvSelectionMode, setTvSelectionMode] = useState<'show' | 'episode'>('show');
  const [animationStyle, setAnimationStyle] = useState<AnimationStyle>('slots');
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>('normal');
  const [resultWatched, setResultWatched] = useState<boolean | null>(null);

  const {
    poolCount,
    totalItems,
    emptyReason,
    dataStats,
    overseerrWarning,
    loadingPoolCount,
  } = usePoolCount(selectedLibraries, mediaType, filters);

  const {
    phase,
    pendingResult,
    activeVariant,
    result,
    error,
    stats,
    setError,
    handleSpin,
    handleAnimationComplete,
    handleSpinAgain,
    resetResult,
    showHistoryResult,
  } = useSpinFlow({
    selectedLibraries,
    mediaType,
    filters,
    tvSelectionMode,
    animationStyle,
    onHistoryRecorded: () => setHistoryRefreshKey((k) => k + 1),
  });

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
        if (preferences.defaultMediaType) {
          setMediaType(preferences.defaultMediaType);
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => {
    const handlePreferencesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        animationStyle?: AnimationStyle;
        animationSpeed?: AnimationSpeed;
        defaultMediaType?: 'movie' | 'show';
        tvSelectionMode?: 'show' | 'episode';
      }>).detail;

      if (detail?.animationStyle) {
        setAnimationStyle(detail.animationStyle);
      }
      if (detail?.animationSpeed) {
        setAnimationSpeed(detail.animationSpeed);
      }
      if (detail?.defaultMediaType) {
        setMediaType(detail.defaultMediaType);
      }
      if (detail?.tvSelectionMode) {
        setTvSelectionMode(detail.tvSelectionMode);
      }
    };

    window.addEventListener('decidarr:preferences-updated', handlePreferencesUpdated);
    return () => window.removeEventListener('decidarr:preferences-updated', handlePreferencesUpdated);
  }, []);

  useEffect(() => {
    const plexId = result?.selection.plexId;
    if (!plexId) {
      setResultWatched(null);
      return;
    }

    let cancelled = false;
    setResultWatched(null);

    watchedApi
      .getStatus(plexId)
      .then(({ watched }) => {
        if (!cancelled) setResultWatched(watched);
      })
      .catch(() => {
        if (!cancelled) setResultWatched(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result?.selection.plexId]);

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
    resetResult();
  }, [resetResult]);

  const handleRevisitHistory = useCallback((entry: SpinHistoryEntry) => {
    const historyResult: SelectionResultResponse = {
      selection: {
        plexId: entry.plexId,
        title: entry.title,
        type: entry.mediaType,
        year: entry.year,
        posterUrl: entry.posterUrl,
        thumbPath: entry.thumbPath,
      },
      playLinks: null,
      stats: { totalMatches: entry.poolSizeAtSpin ?? 0 },
    };
    showHistoryResult(historyResult);
  }, [showHistoryResult]);

  const handleMediaTypeChange = useCallback((type: string) => {
    setMediaType(type);
    setSelectedLibraries([]);
    resetResult();
    setFilters(DEFAULT_FILTERS);
  }, [resetResult]);

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
                      item={result.selection}
                      tmdb={result.selection.tmdb ?? undefined}
                      isWatched={resultWatched ?? false}
                      onWatchedChange={setResultWatched}
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
                        onClick={resetResult}
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
