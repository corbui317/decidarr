import type { Types } from 'mongoose';
import {
  mongoIdSchema,
  spinHistoryCreateBodySchema,
  type SpinHistoryContract,
} from '@decidarr/api-contracts';
import { User, type ISpinHistoryPreferences } from '@/lib/models/User';
import { SpinHistoryEntry, type ISpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { DomainError, parseContract } from '@/lib/request/errors';
import { sanitizeThumbPathInput } from '@/lib/plex-image';
import { emitSyncChange } from './sync-changes';
import type { UserDataActor } from '.';

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

/** The one reading of stored (or patched) spin history preferences: defaults for anything unset, the limit clamped. */
export function normalizeSpinHistoryPreferences(spinHistory: unknown): ISpinHistoryPreferences {
  const defaults = getDefaultSpinHistoryPreferences();
  const prefs = spinHistory as Partial<ISpinHistoryPreferences> | undefined;
  return {
    enabled: prefs?.enabled ?? defaults.enabled,
    retentionLimit: normalizeRetentionLimit(prefs?.retentionLimit ?? defaults.retentionLimit),
    storeFilterSnapshot: prefs?.storeFilterSnapshot ?? defaults.storeFilterSnapshot,
  };
}

export function sanitizeFilterSnapshot(filters: unknown): Record<string, unknown> | undefined {
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

export function toSpinHistoryContract(item: {
  _id: Types.ObjectId | string;
  plexId: string;
  title: string;
  mediaType: 'movie' | 'show' | 'episode';
  thumbPath?: string;
  year?: number;
  libraryIds?: string[];
  filtersSnapshot?: Record<string, unknown>;
  tvSelectionMode?: 'show' | 'episode';
  poolSizeAtSpin?: number;
  spunAt: Date;
}): SpinHistoryContract {
  return {
    id: item._id.toString(),
    plexId: item.plexId,
    title: item.title,
    mediaType: item.mediaType,
    thumbPath: item.thumbPath,
    year: item.year,
    libraryIds: item.libraryIds ?? [],
    filtersSnapshot: item.filtersSnapshot,
    tvSelectionMode: item.tvSelectionMode,
    poolSizeAtSpin: item.poolSizeAtSpin,
    spunAt: item.spunAt.toISOString(),
  };
}

async function deleteEntries(userId: Types.ObjectId, ids: Types.ObjectId[]): Promise<void> {
  if (ids.length === 0) return;
  await SpinHistoryEntry.deleteMany({ _id: { $in: ids }, userId });
  for (const id of ids) {
    await emitSyncChange(userId, 'spin_history', id.toString(), 'delete', null);
  }
}

/** Deletes the user's oldest entries beyond `retentionLimit`, telling clients about each. */
export async function trimSpinHistory(userId: Types.ObjectId, retentionLimit: number): Promise<void> {
  const excess = (await SpinHistoryEntry.countDocuments({ userId })) - normalizeRetentionLimit(retentionLimit);
  if (excess <= 0) return;
  const oldest = await SpinHistoryEntry.find({ userId }).sort({ spunAt: 1 }).limit(excess).select('_id').lean();
  await deleteEntries(userId, oldest.map((entry) => entry._id));
}

/**
 * Records a spin in the actor's history, unless they turned history off (then `entry` is
 * null and nothing is written). Sanitizes the thumb path and filter snapshot, then trims
 * the history to the actor's retention limit.
 */
export async function recordSpin(
  actor: UserDataActor,
  input: unknown,
  spunAt: Date = new Date()
): Promise<{ entry: ISpinHistoryEntry | null; revision: number }> {
  const spin = parseContract(spinHistoryCreateBodySchema, input);
  const user = await User.findById(actor.userId).select('preferences.spinHistory');
  const prefs = normalizeSpinHistoryPreferences(user?.preferences?.spinHistory);
  if (!prefs.enabled) {
    return { entry: null, revision: 0 };
  }

  const entry = await SpinHistoryEntry.create({
    userId: actor.userId,
    plexId: spin.plexId,
    title: spin.title,
    mediaType: spin.mediaType,
    thumbPath: sanitizeThumbPathInput(spin.thumbPath),
    year: spin.year ?? undefined,
    libraryIds: spin.libraryIds,
    filtersSnapshot: prefs.storeFilterSnapshot ? sanitizeFilterSnapshot(spin.filtersSnapshot) : undefined,
    tvSelectionMode: spin.tvSelectionMode ?? undefined,
    poolSizeAtSpin: spin.poolSizeAtSpin ?? undefined,
    spunAt,
  });
  const revision = await emitSyncChange(
    actor.userId,
    'spin_history',
    entry._id.toString(),
    'upsert',
    toSpinHistoryContract(entry)
  );
  await trimSpinHistory(actor.userId, prefs.retentionLimit);
  return { entry, revision };
}

/** Deletes one of the actor's entries; NOT_FOUND when they have no entry with that id. */
export async function deleteSpin(actor: UserDataActor, id: unknown): Promise<{ revision: number }> {
  const entryId = parseContract(mongoIdSchema, id);
  const result = await SpinHistoryEntry.deleteOne({ _id: entryId, userId: actor.userId });
  if (result.deletedCount === 0) {
    throw new DomainError('NOT_FOUND', 'History entry not found');
  }
  return { revision: await emitSyncChange(actor.userId, 'spin_history', entryId, 'delete', null) };
}

/** Deletes all of the actor's entries and returns how many there were. */
export async function clearSpinHistory(actor: UserDataActor): Promise<number> {
  const entries = await SpinHistoryEntry.find({ userId: actor.userId }).select('_id').lean();
  await deleteEntries(actor.userId, entries.map((entry) => entry._id));
  return entries.length;
}
