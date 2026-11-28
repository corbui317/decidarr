'use client';

import { useState, useCallback } from 'react';
import { selectionApi, AnimationStyle, isAuthError } from '@/lib/api';
import { resolveAnimationStyle, ResolvedAnimationStyle } from '@/components/animations';
import {
  Filters,
  type SelectionResultResponse,
  type MediaType,
  type TvSelectionMode,
} from '@decidarr/api-contracts';

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
  /** The error is a refused session or Plex token: only signing in again helps. */
  const [signInRequired, setSignInRequired] = useState(false);
  const [stats, setStats] = useState<{ totalMatches: number } | null>(null);

  const handleSpin = useCallback(async () => {
    if (selectedLibraries.length === 0) return;

    setPhase('loading');
    setError(null);
    setSignInRequired(false);
    setResult(null);
    setPendingResult(null);

    const variant = resolveAnimationStyle(animationStyle);
    setActiveVariant(variant);

    try {
      const data = await selectionApi.getRandom({
        libraryIds: selectedLibraries,
        mediaType,
        filters,
        tvSelectionMode: mediaType === 'show' ? tvSelectionMode : undefined,
      });

      setPendingResult(data);
      setStats(data.stats);
      // The server recorded this spin in the user's history before answering.
      onHistoryRecorded?.();

      setPhase('animating');
    } catch (err) {
      if (isAuthError(err)) {
        setSignInRequired(true);
        setError(err.message);
      } else if (err instanceof Error && 'code' in err) {
        const apiError = err as { code?: string; message: string };
        if (apiError.code === 'NO_ITEMS_IN_LIBRARIES' || apiError.code === 'NO_ITEMS_MATCH_FILTERS') {
          setError('No items found matching your criteria');
        } else if (apiError.code === 'NO_LIBRARIES') {
          setError('At least one library must be selected');
        } else if (apiError.code === 'NO_ACCESSIBLE_LIBRARIES') {
          setError('No accessible libraries selected');
        } else if (apiError.code === 'MACHINE_ID_MISSING') {
          setError('Plex machine ID not configured');
        } else {
          setError(apiError.message || 'Something went wrong. Please try again.');
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
    signInRequired,
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
