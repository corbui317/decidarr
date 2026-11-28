/**
 * The user-data store: the one owner of a user's preferences, watched state, and spin
 * history. Every write validates its input against the shared contract, sanitizes it,
 * enforces the rules (manual watched is the Admin's alone, spin history keeps the user's
 * retention limit), persists it, and emits the sync change mobile clients pull.
 * REST routes and the sync mutation applier both call it, so the two cannot drift;
 * refusals are DomainErrors, which each caller reports in its own shape.
 */
import type { Types } from 'mongoose';

/** Who is writing: the store only ever touches this user's own data. */
export interface UserDataActor {
  userId: Types.ObjectId;
  isAdmin: boolean;
}

export { updatePreferences, toPreferenceContract } from './preferences';
export { markWatched, unmarkWatched, toWatchedContract } from './watched';
export {
  recordSpin,
  deleteSpin,
  clearSpinHistory,
  normalizeSpinHistoryPreferences,
  toSpinHistoryContract,
} from './spin-history';
