import {
  AnimationSpeed,
  AnimationStyle,
  ResolvedAnimationStyle,
} from './types';

const SPEED_MULTIPLIERS: Record<AnimationSpeed, number> = {
  fast: 0.55,
  normal: 1,
  dramatic: 1.75,
};

const BASE_DURATIONS: Record<ResolvedAnimationStyle, number> = {
  slots: 2400,
  roulette: 3200,
  wheel: 3200,
  plinko: 3600,
};

const RESOLVED_STYLES: ResolvedAnimationStyle[] = ['slots', 'roulette', 'wheel', 'plinko'];

export function getAnimationDurationMs(
  style: ResolvedAnimationStyle,
  speed: AnimationSpeed
): number {
  return Math.round(BASE_DURATIONS[style] * SPEED_MULTIPLIERS[speed]);
}

export function resolveAnimationStyle(setting: AnimationStyle): ResolvedAnimationStyle {
  if (setting === 'random') {
    return pickRandomAnimation();
  }
  return setting;
}

export function pickRandomAnimation(): ResolvedAnimationStyle {
  return RESOLVED_STYLES[Math.floor(Math.random() * RESOLVED_STYLES.length)];
}

export function getPosterUrl(item: { posterUrl?: string; art?: string }): string | null {
  return item.posterUrl || item.art || null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
