import mongoose from 'mongoose';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { connectDB } from './db';
import { getOrCreateSettings, ISpinHistoryPreferences, ISettings } from './models/Settings';
import { User } from './models/User';
import { deriveKey } from './secrets';
import { SpinHistoryEntry } from './models/SpinHistoryEntry';

export const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

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

type SessionPayload = {
  sub?: string;
  plexUserId?: string;
  sessionVersion?: number;
  username?: string;
};

export async function getCurrentUserId(): Promise<mongoose.Types.ObjectId> {
  await connectDB();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('decidarr_session')?.value;
    if (!token) {
      return SINGLE_USER_ID;
    }

    const payload = jwt.verify(token, deriveKey('web-session')) as SessionPayload;

    if (payload.sub && payload.sessionVersion !== undefined) {
      if (mongoose.Types.ObjectId.isValid(payload.sub)) {
        const user = await User.findById(payload.sub);
        if (user && user.sessionVersion === payload.sessionVersion) {
          return user._id as mongoose.Types.ObjectId;
        }
      }
    }

    if (payload.username) {
      const user = await User.findOne({ plexUsername: payload.username });
      if (user?._id) {
        return user._id as mongoose.Types.ObjectId;
      }
    }
  } catch {
    // Fall back to single-user id for legacy installs.
  }

  return SINGLE_USER_ID;
}

export async function getSpinHistoryPreferences(): Promise<ISpinHistoryPreferences> {
  await connectDB();
  const settings = await getOrCreateSettings();
  const userId = await getCurrentUserId();

  if (!userId.equals(SINGLE_USER_ID)) {
    const user = await User.findById(userId);
    if (user?.preferences?.spinHistory) {
      return {
        enabled: user.preferences.spinHistory.enabled ?? true,
        retentionLimit: normalizeRetentionLimit(user.preferences.spinHistory.retentionLimit),
        storeFilterSnapshot: user.preferences.spinHistory.storeFilterSnapshot ?? true,
      };
    }
  }

  const prefs = settings.spinHistoryPreferences;
  if (prefs) {
    return {
      enabled: prefs.enabled ?? true,
      retentionLimit: normalizeRetentionLimit(prefs.retentionLimit),
      storeFilterSnapshot: prefs.storeFilterSnapshot ?? true,
    };
  }

  return getDefaultSpinHistoryPreferences();
}

export async function saveSpinHistoryPreferences(
  patch: Partial<ISpinHistoryPreferences>
): Promise<ISpinHistoryPreferences> {
  await connectDB();
  const settings = await getOrCreateSettings();
  const userId = await getCurrentUserId();
  const current = await getSpinHistoryPreferences();

  const next: ISpinHistoryPreferences = {
    enabled: patch.enabled ?? current.enabled,
    retentionLimit:
      patch.retentionLimit !== undefined
        ? normalizeRetentionLimit(patch.retentionLimit)
        : current.retentionLimit,
    storeFilterSnapshot: patch.storeFilterSnapshot ?? current.storeFilterSnapshot,
  };

  if (!userId.equals(SINGLE_USER_ID)) {
    const user = await User.findById(userId);
    if (user) {
      user.preferences = user.preferences || {};
      user.preferences.spinHistory = next;
      await user.save();
    }
  } else {
    settings.spinHistoryPreferences = next;
    await settings.save();
  }

  if (patch.retentionLimit !== undefined && patch.retentionLimit < current.retentionLimit) {
    await trimSpinHistoryToRetention(userId, next.retentionLimit);
  }

  return next;
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

export async function getSettingsForAuth(): Promise<ISettings> {
  await connectDB();
  return getOrCreateSettings();
}
