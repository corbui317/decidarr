import { preferencesPutBodySchema, type PreferenceContract } from '@decidarr/api-contracts';
import { User, type IUser, type ISpinHistoryPreferences } from '@/lib/models/User';
import { DomainError, parseContract } from '@/lib/request/errors';
import { emitSyncChange } from './sync-changes';
import { normalizeSpinHistoryPreferences, trimSpinHistory } from './spin-history';
import type { UserDataActor } from '.';

export function toPreferenceContract(user: IUser): PreferenceContract {
  return {
    theme: user.preferences?.theme,
    selectedLibraries: user.preferences?.selectedLibraries,
    defaultMediaType: user.preferences?.defaultMediaType,
    tvSelectionMode: user.preferences?.tvSelectionMode,
    animationStyle: user.preferences?.animationStyle,
    animationSpeed: user.preferences?.animationSpeed,
    savedFilters: user.preferences?.savedFilters,
    spinHistory: normalizeSpinHistoryPreferences(user.preferences?.spinHistory),
  };
}

/**
 * Applies a partial preferences update: only the fields given change, saved filters and
 * spin history preferences field by field. Setting a spin history retention limit trims
 * the history to it.
 */
export async function updatePreferences(
  actor: UserDataActor,
  input: unknown
): Promise<{ user: IUser; spinHistory: ISpinHistoryPreferences; revision: number }> {
  const { savedFilters, spinHistory: spinHistoryPatch, ...fields } = parseContract(preferencesPutBodySchema, input);
  const user = await User.findById(actor.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }

  for (const [field, value] of Object.entries(fields)) {
    user.set(`preferences.${field}`, value);
  }
  for (const [field, value] of Object.entries(savedFilters ?? {})) {
    user.set(`preferences.savedFilters.${field}`, value);
  }
  const spinHistory = normalizeSpinHistoryPreferences({
    ...normalizeSpinHistoryPreferences(user.preferences?.spinHistory),
    ...spinHistoryPatch,
  });
  if (spinHistoryPatch) {
    user.set('preferences.spinHistory', spinHistory);
  }

  await user.save();
  const revision = await emitSyncChange(user._id, 'preference', user._id.toString(), 'upsert', toPreferenceContract(user));
  if (spinHistoryPatch?.retentionLimit !== undefined) {
    await trimSpinHistory(user._id, spinHistory.retentionLimit);
  }
  return { user, spinHistory, revision };
}
