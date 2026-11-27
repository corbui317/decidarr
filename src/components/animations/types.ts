import type { AnimationSpeed, AnimationStyle } from '@decidarr/api-contracts';

// Re-export types for local use
export type { AnimationSpeed, AnimationStyle };

export type ResolvedAnimationStyle = Exclude<AnimationStyle, 'random'>;

export interface PlexItem {
  plexId: string;
  title: string;
  type: string;
  year?: number;
  posterUrl?: string;
  art?: string;
  [key: string]: unknown;
}

export interface SpinAnimation {
  readonly duration: AnimationSpeed;
  play(result: PlexItem): Promise<void>;
  skip(): void;
}

export const ANIMATION_STYLE_LABELS: Record<AnimationStyle, string> = {
  slots: 'Slots',
  roulette: 'Roulette Wheel',
  wheel: 'Wheel of Fortune',
  plinko: 'Plinko',
  random: 'Random',
};

export const ANIMATION_SPEED_LABELS: Record<AnimationSpeed, string> = {
  fast: 'Fast',
  normal: 'Normal',
  dramatic: 'Dramatic',
};
