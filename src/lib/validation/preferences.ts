type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SpinHistoryPreferencesPatch {
  enabled?: boolean;
  retentionLimit?: number;
  storeFilterSnapshot?: boolean;
}

export interface PreferencesPatchBody {
  spinHistory: SpinHistoryPreferencesPatch;
}

export function parsePreferencesPatchBody(body: unknown): ParseResult<PreferencesPatchBody> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const raw = body as Record<string, unknown>;

  if (!raw.spinHistory || typeof raw.spinHistory !== 'object' || Array.isArray(raw.spinHistory)) {
    return { ok: false, error: 'No valid preference fields provided' };
  }

  const spinHistoryRaw = raw.spinHistory as Record<string, unknown>;
  const spinHistory: SpinHistoryPreferencesPatch = {};

  if ('enabled' in spinHistoryRaw) {
    if (typeof spinHistoryRaw.enabled !== 'boolean') {
      return { ok: false, error: 'spinHistory.enabled must be a boolean' };
    }
    spinHistory.enabled = spinHistoryRaw.enabled;
  }

  if ('retentionLimit' in spinHistoryRaw) {
    if (
      typeof spinHistoryRaw.retentionLimit !== 'number' ||
      Number.isNaN(spinHistoryRaw.retentionLimit)
    ) {
      return { ok: false, error: 'spinHistory.retentionLimit must be a number' };
    }
    spinHistory.retentionLimit = spinHistoryRaw.retentionLimit;
  }

  if ('storeFilterSnapshot' in spinHistoryRaw) {
    if (typeof spinHistoryRaw.storeFilterSnapshot !== 'boolean') {
      return { ok: false, error: 'spinHistory.storeFilterSnapshot must be a boolean' };
    }
    spinHistory.storeFilterSnapshot = spinHistoryRaw.storeFilterSnapshot;
  }

  if (Object.keys(spinHistory).length === 0) {
    return { ok: false, error: 'No valid preference fields provided' };
  }

  return { ok: true, data: { spinHistory } };
}
