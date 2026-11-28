import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { User } from '@/lib/models/User';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { issueTokenPair, rotateRefreshToken } from '@/lib/mobile-auth/tokens';

const DEVICE_ID = 'device-rotation-1';

describe('Mobile refresh token rotation (M6)', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedConfiguredSettings();
  });

  it('two concurrent refreshes with the same refresh token yield at most one new token, and no token in the family remains live afterward', async () => {
    const user = await seedTestUser();
    const { refreshToken } = await issueTokenPair(user, DEVICE_ID);

    const results = await Promise.allSettled([
      rotateRefreshToken(refreshToken, DEVICE_ID),
      rotateRefreshToken(refreshToken, DEVICE_ID),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof rotateRefreshToken>>> =>
        r.status === 'fulfilled'
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBeLessThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'UNAUTHORIZED' });
    }

    // Whatever "won" the race is dead too: this is the whole point of reuse detection
    // under true concurrency, where a legitimate retry and a replay look identical.
    if (fulfilled.length === 1) {
      await expect(
        rotateRefreshToken(fulfilled[0].value.refreshToken, DEVICE_ID)
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    // The original is dead too, deterministically, regardless of which branch won.
    await expect(rotateRefreshToken(refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const unrevokedCount = await MobileRefreshToken.countDocuments({
      userId: user._id,
      revokedAt: { $exists: false },
    });
    expect(unrevokedCount).toBe(0);
  });

  it('replaying a rotated refresh token revokes its whole family, including the token issued by the legitimate rotation', async () => {
    const user = await seedTestUser();
    const first = await issueTokenPair(user, DEVICE_ID);

    const rotatedOnce = await rotateRefreshToken(first.refreshToken, DEVICE_ID);

    await expect(rotateRefreshToken(first.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    await expect(rotateRefreshToken(rotatedOnce.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('a replay with the wrong device id still revokes the family, rather than returning early', async () => {
    const user = await seedTestUser();
    const first = await issueTokenPair(user, DEVICE_ID);
    const rotatedOnce = await rotateRefreshToken(first.refreshToken, DEVICE_ID);

    // The stale, already-rotated token presented with a device id that never issued it.
    await expect(rotateRefreshToken(first.refreshToken, 'attacker-device')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    // The family is dead, not just this one mismatched attempt.
    await expect(rotateRefreshToken(rotatedOnce.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('a replay while the user is unapproved still revokes the family, rather than returning early', async () => {
    const user = await seedTestUser({ isApproved: true });
    const first = await issueTokenPair(user, DEVICE_ID);
    const rotatedOnce = await rotateRefreshToken(first.refreshToken, DEVICE_ID);

    await User.updateOne({ _id: user._id }, { $set: { isApproved: false } });
    await expect(rotateRefreshToken(first.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    // Restoring approval does not resurrect the family: the replay already killed it.
    await User.updateOne({ _id: user._id }, { $set: { isApproved: true } });
    await expect(rotateRefreshToken(rotatedOnce.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('a device presenting the right token with the wrong device id fails without consuming the token', async () => {
    const user = await seedTestUser();
    const { refreshToken } = await issueTokenPair(user, DEVICE_ID);

    await expect(rotateRefreshToken(refreshToken, 'some-other-device')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const rotated = await rotateRefreshToken(refreshToken, DEVICE_ID);
    expect(rotated.accessToken).toBeTruthy();
  });
});
