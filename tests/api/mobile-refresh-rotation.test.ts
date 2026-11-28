import { describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../helpers/mongo';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { issueTokenPair, rotateRefreshToken } from '@/lib/mobile-auth/tokens';

const DEVICE_ID = 'device-rotation-1';

describe('Mobile refresh token rotation (M6)', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedConfiguredSettings();
  });

  it('two concurrent refreshes with the same refresh token yield at most one new token', async () => {
    const user = await seedTestUser();
    const { refreshToken, user: _unused } = await issueTokenPair(user, DEVICE_ID);
    void _unused;

    const results = await Promise.allSettled([
      rotateRefreshToken(refreshToken, DEVICE_ID),
      rotateRefreshToken(refreshToken, DEVICE_ID),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'UNAUTHORIZED' });

    const unrevokedCount = await MobileRefreshToken.countDocuments({
      userId: user._id,
      revokedAt: { $exists: false },
    });
    expect(unrevokedCount).toBeLessThanOrEqual(1);
  });

  it('replaying a rotated refresh token revokes its whole family, including the token issued by the legitimate rotation', async () => {
    const user = await seedTestUser();
    const first = await issueTokenPair(user, DEVICE_ID);

    const rotatedOnce = await rotateRefreshToken(first.refreshToken, DEVICE_ID);

    // Replaying the now-stale original token is rejected...
    await expect(rotateRefreshToken(first.refreshToken, DEVICE_ID)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    // ...and the whole family it belonged to, including the legitimately-rotated
    // successor, is now dead: only a fresh sign-in recovers from a detected replay.
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
