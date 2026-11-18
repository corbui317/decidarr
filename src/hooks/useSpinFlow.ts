'use client';

import { useState, useCallback } from 'react';
import { selectionApi, spinHistoryApi, AnimationStyle } from '@/lib/api';
import { resolveAnimationStyle, ResolvedAnimationStyle } from '@/components/animations';
import { Filters } from '@/types/filters';
import type { SelectionResultResponse } from '@/types/api/selection';

export type SpinPhase = 'idle' | 'loading' | 'animating' | 'result';

export interface UseSpinFlowOptions {
  selectedLibraries: string[];
  mediaType: string;
  filters: Filters;
  tvSelectionMode: 'show' | 'episode';
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
        mediaType as 'movie' | 'show',
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
          mediaType: (selection.type as 'movie' | 'show' | 'episode') || 'movie',
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
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong';
      if (errorMessage.includes('No items')) {
        setError('No items found matching your criteria');
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
