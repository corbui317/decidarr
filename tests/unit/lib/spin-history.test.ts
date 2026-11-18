import { describe, it, expect, beforeEach } from 'vitest';
import { setTestCookie, clearTestCookies } from '../../helpers/cookies';
import { seedConfiguredSettings, seedTestUser, createModernSessionToken } from '../../helpers/auth';
import {
  getCurrentUserId,
  SINGLE_USER_ID,
  normalizeRetentionLimit,
  sanitizeFilterSnapshot,
  getDefaultSpinHistoryPreferences,
  SPIN_HISTORY_MIN_RETENTION,
  SPIN_HISTORY_MAX_RETENTION,
  SPIN_HISTORY_DEFAULT_RETENTION,
} from '@/lib/spin-history';
import { clearDatabase } from '../../helpers/mongo';

describe('getCurrentUserId', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
  });

  it('resolves modern session sub to user id', async () => {
    const user = await seedTestUser();
    const token = await createModernSessionToken(user);
    setTestCookie('decidarr_session', token);

    const userId = await getCurrentUserId();
    expect(userId.toString()).toBe(user._id.toString());
  });

  it('falls back to SINGLE_USER_ID when no session cookie', async () => {
    const userId = await getCurrentUserId();
    expect(userId.equals(SINGLE_USER_ID)).toBe(true);
  });
});

describe('normalizeRetentionLimit', () => {
  it('returns default for invalid input', () => {
    expect(normalizeRetentionLimit('abc')).toBe(SPIN_HISTORY_DEFAULT_RETENTION);
  });

  it('clamps below minimum', () => {
    expect(normalizeRetentionLimit(-5)).toBe(SPIN_HISTORY_MIN_RETENTION);
  });

  it('clamps above maximum', () => {
    expect(normalizeRetentionLimit(9999)).toBe(SPIN_HISTORY_MAX_RETENTION);
  });

  it('passes through valid values', () => {
    expect(normalizeRetentionLimit(100)).toBe(100);
  });
});

describe('sanitizeFilterSnapshot', () => {
  it('returns undefined for non-objects', () => {
    expect(sanitizeFilterSnapshot(null)).toBeUndefined();
    expect(sanitizeFilterSnapshot([])).toBeUndefined();
  });

  it('strips sensitive keys', () => {
    const result = sanitizeFilterSnapshot({
      genres: ['Action'],
      plexToken: 'secret',
      apiKey: 'hidden',
      password: 'nope',
    });
    expect(result).toEqual({ genres: ['Action'] });
  });

  it('returns undefined when snapshot exceeds size limit', () => {
    const huge = { data: 'x'.repeat(9000) };
    expect(sanitizeFilterSnapshot(huge)).toBeUndefined();
  });
});

describe('getDefaultSpinHistoryPreferences', () => {
  it('returns enabled defaults', () => {
    expect(getDefaultSpinHistoryPreferences()).toEqual({
      enabled: true,
      retentionLimit: SPIN_HISTORY_DEFAULT_RETENTION,
      storeFilterSnapshot: true,
    });
  });
});
