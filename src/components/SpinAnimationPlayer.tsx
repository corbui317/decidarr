'use client';

import { useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AnimationSpeed,
  PlexItem,
  ResolvedAnimationStyle,
  SlotsAnimation,
  RouletteAnimation,
  WheelOfFortuneAnimation,
  PlinkoAnimation,
  usePrefersReducedMotion,
} from '@/components/animations';
import type { SpinAnimationHandle } from '@/components/animations/SpinAnimationHandle';

interface SpinAnimationPlayerProps {
  variant: ResolvedAnimationStyle;
  result: PlexItem;
  speed: AnimationSpeed;
  onComplete: () => void;
  onSkipReady?: (skip: () => void) => void;
}

export default function SpinAnimationPlayer({
  variant,
  result,
  speed,
  onComplete,
  onSkipReady,
}: SpinAnimationPlayerProps) {
  const animRef = useRef<SpinAnimationHandle>(null);
  const reducedMotion = usePrefersReducedMotion();

  const handleSkip = useCallback(() => {
    animRef.current?.skip();
  }, []);

  useEffect(() => {
    onSkipReady?.(handleSkip);
  }, [onSkipReady, handleSkip]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkip();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleSkip]);

  const common = {
    ref: animRef,
    result,
    speed,
    reducedMotion,
    onComplete,
  };

  return (
    <div className="flex flex-col items-center w-full">
      {variant === 'slots' && <SlotsAnimation {...common} />}
      {variant === 'roulette' && <RouletteAnimation {...common} />}
      {variant === 'wheel' && <WheelOfFortuneAnimation {...common} />}
      {variant === 'plinko' && <PlinkoAnimation {...common} />}

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleSkip}
        className="mt-8 px-6 py-2 rounded-lg border border-gray-600 text-gray-300
                   hover:border-decidarr-primary hover:text-white transition-colors text-sm"
      >
        Skip (Esc)
      </motion.button>
    </div>
  );
}
