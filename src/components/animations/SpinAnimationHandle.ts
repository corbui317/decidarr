import { AnimationSpeed } from './types';

export interface SpinAnimationHandle {
  skip: () => void;
  duration: AnimationSpeed;
}
