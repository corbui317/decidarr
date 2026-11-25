import mongoose from 'mongoose';
import { ISpinHistoryPreferences } from './models/Settings';
import { User } from './models/User';
import { SpinHistoryEntry } from './models/SpinHistoryEntry';

export const SPIN_HISTORY_MIN_RETENTION = 1;
export const SPIN_HISTORY_MAX_RETENTION = 500;
export const SPIN_HISTORY_DEFAULT_RETENTION = 50;
export const SPIN_HISTORY_MAX_SNAPSHOT_BYTES = 8192;

const SENSITIVE_FILTER_KEYS = /token|apikey|api_key|secret|password|authorization|cookie|header|url/i;

export function getDefaultSpinHistoryPreferences(): ISpinHistoryPreferences {
  return {
    enabled: true,
    retentionLimit: SPIN_HISTORY_DEFAULT_RETENTION,
    storeFilterSnapshot: true,
  };
}

export function normalizeRetentionLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return SPIN_HISTORY_DEFAULT_RETENTION;
  return Math.max(SPIN_HISTORY_MIN_RETENTION, Math.min(SPIN_HISTORY_MAX_RETENTION, parsed));
}

export function normalizeSpinHistoryPreferences(spinHistory: unknown): ISpinHistoryPreferences {
  const defaults = getDefaultSpinHistoryPreferences();
  const prefs = spinHistory as Partial<ISpinHistoryPreferences> | undefined;
  return {
    enabled: prefs?.enabled ?? defaults.enabled,
    retentionLimit: normalizeRetentionLimit(prefs?.retentionLimit ?? defaults.retentionLimit),
    storeFilterSnapshot: prefs?.storeFilterSnapshot ?? defaults.storeFilterSnapshot,
  };
}

/**
 * Merge a spin history patch into current preferences.
 * Returns the merged preferences and the previous retention limit for trim comparison.
 */
export function mergeSpinHistoryPreferences(
  current: unknown,
  patch: { enabled?: boolean; retentionLimit?: number; storeFilterSnapshot?: boolean }
): { merged: ISpinHistoryPreferences; previousRetention: number } {
  const normalized = normalizeSpinHistoryPreferences(current);
  const previousRetention = normalized.retentionLimit;

  const merged: ISpinHistoryPreferences = {
    enabled: patch.enabled ?? normalized.enabled,
    retentionLimit:
      patch.retentionLimit !== undefined
        ? normalizeRetentionLimit(patch.retentionLimit)
        : normalized.retentionLimit,
    storeFilterSnapshot: patch.storeFilterSnapshot ?? normalized.storeFilterSnapshot,
  };

  return { merged, previousRetention };
}

/**
 * Trim spin history if retention limit was reduced.
 */
export async function trimHistoryIfRetentionReduced(
  userId: mongoose.Types.ObjectId,
  previousRetention: number,
  nextRetention: number,
  wasExplicitlySet: boolean
): Promise<void> {
  if (wasExplicitlySet && nextRetention < previousRetention) {
    await trimSpinHistoryToRetention(userId, nextRetention);
  }
}

export function sanitizeFilterSnapshot(
  filters: unknown
): Record<string, unknown> | undefined {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (SENSITIVE_FILTER_KEYS.test(key)) continue;
    sanitized[key] = value;
  }

  const serialized = JSON.stringify(sanitized);
  if (serialized.length > SPIN_HISTORY_MAX_SNAPSHOT_BYTES) {
    return undefined;
  }

  return sanitized;
}

/** The user's spin-history preferences, with schema defaults for anything unset. */
export async function getSpinHistoryPreferences(
  userId: mongoose.Types.ObjectId
): Promise<ISpinHistoryPreferences> {
  const user = await User.findById(userId).select('preferences.spinHistory');
  return normalizeSpinHistoryPreferences(user?.preferences?.spinHistory);
}

export async function trimSpinHistoryToRetention(
  userId: mongoose.Types.ObjectId,
  retentionLimit: number
): Promise<void> {
  const limit = normalizeRetentionLimit(retentionLimit);
  const total = await SpinHistoryEntry.countDocuments({ userId });
  if (total <= limit) return;

  const excess = total - limit;
  const oldest = await SpinHistoryEntry.find({ userId })
    .sort({ spunAt: 1 })
    .limit(excess)
    .select('_id')
    .lean();

  const ids = oldest.map((entry) => entry._id);
  if (ids.length > 0) {
    await SpinHistoryEntry.deleteMany({ _id: { $in: ids }, userId });
  }
}
