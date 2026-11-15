'use client';

import { useState, useCallback } from 'react';
import { selectionApi, spinHistoryApi, AnimationStyle } from '@/lib/api';
import { resolveAnimationStyle, ResolvedAnimationStyle } from '@/components/animations';
import { Filters } from '@/types/filters';
import type { SelectionResultResponse } from '@/types/api/selection';
import type { MediaType, TvSelectionMode, SelectionError } from '@/types/shared';

export type SpinPhase = 'idle' | 'loading' | 'animating' | 'result';

export interface UseSpinFlowOptions {
  selectedLibraries: string[];
  mediaType: MediaType;
  filters: Filters;
  tvSelectionMode: TvSelectionMode;
  animationStyle: AnimationStyle;
  onHistoryRecorded?: () => void;
}

export function useSpinFlow({
  selectedLibraries,
  mediaType,
  filters,
  tvSelectionMode,
  animationStyle,
  onHistoryRecorded,
}: UseSpinFlowOptions) {
  const [phase, setPhase] = useState<SpinPhase>('idle');
  const [pendingResult, setPendingResult] = useState<SelectionResultResponse | null>(null);
  const [activeVariant, setActiveVariant] = useState<ResolvedAnimationStyle>('slots');
  const [result, setResult] = useState<SelectionResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ totalMatches: number } | null>(null);

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

      const selectionResult = data;
      setPendingResult(selectionResult);
      setStats(selectionResult.stats);

      const { selection } = selectionResult;
      spinHistoryApi
        .create({
          plexId: selection.plexId,
          title: selection.title,
          mediaType: selection.type as MediaType,
          thumbPath: selection.thumbPath,
          year: selection.year,
          libraryIds: selectedLibraries,
          filtersSnapshot: filters,
          tvSelectionMode: mediaType === 'show' ? tvSelectionMode : undefined,
          poolSizeAtSpin: selectionResult.stats?.totalMatches,
        })
        .then(() => onHistoryRecorded?.())
        .catch((historyErr) => console.error('Failed to record spin history:', historyErr));

      setPhase('animating');
    } catch (err) {
      // Check if it's a response error with SelectionError structure
      if (err && typeof err === 'object' && 'code' in err) {
        const selectionError = err as SelectionError;
        if (selectionError.code === 'NO_ITEMS_IN_LIBRARIES' || selectionError.code === 'NO_ITEMS_MATCH_FILTERS') {
          setError('No items found matching your criteria');
        } else {
          setError(selectionError.message || 'Something went wrong. Please try again.');
        }
      } else {
        setError('Something went wrong. Please try again.');
      }
      setPhase('idle');
    }
  }, [selectedLibraries, mediaType, filters, tvSelectionMode, animationStyle, onHistoryRecorded]);

  const handleAnimationComplete = useCallback(() => {
    if (pendingResult) {
      setResult(pendingResult);
      setPendingResult(null);
    }
    setPhase('result');
  }, [pendingResult]);

  const handleSpinAgain = useCallback(() => {
    setResult(null);
    setPhase('idle');
    void handleSpin();
  }, [handleSpin]);

  const resetResult = useCallback(() => {
    setResult(null);
    setPhase('idle');
  }, []);

  const showHistoryResult = useCallback((historyResult: SelectionResultResponse) => {
    setResult(historyResult);
    setPhase('result');
  }, []);

  return {
    phase,
    pendingResult,
    activeVariant,
    result,
    error,
    stats,
    setError,
    setResult,
    setPhase,
    handleSpin,
    handleAnimationComplete,
    handleSpinAgain,
    resetResult,
    showHistoryResult,
  };
}
