export type {
  AnimationSpeed,
  AnimationStyle,
  ResolvedAnimationStyle,
  PlexItem,
  SpinAnimation,
} from './types';

export {
  ANIMATION_STYLE_LABELS,
  ANIMATION_SPEED_LABELS,
} from './types';

export {
  getAnimationDurationMs,
  resolveAnimationStyle,
  pickRandomAnimation,
  getPosterUrl,
  prefersReducedMotion,
} from './utils';

export { usePrefersReducedMotion } from './usePrefersReducedMotion';
export type { SpinAnimationHandle } from './SpinAnimationHandle';

export { SlotsAnimation } from './slots';
export { RouletteAnimation } from './roulette';
export { WheelOfFortuneAnimation } from './wheel';
export { PlinkoAnimation } from './plinko';

import type { RefObject } from 'react';
import { AnimationSpeed, PlexItem, SpinAnimation } from './types';
import type { SpinAnimationHandle } from './SpinAnimationHandle';

/** Wraps a mounted animation ref as a SpinAnimation (play resolves when the view calls onComplete). */
export function createSpinAnimationFromRef(
  ref: RefObject<SpinAnimationHandle | null>,
  speed: AnimationSpeed,
  waitForComplete: () => Promise<void>
): SpinAnimation {
  return {
    duration: speed,
    async play(_result: PlexItem) {
      await waitForComplete();
    },
    skip() {
      ref.current?.skip();
    },
  };
}
