import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AUTH_CODE_TTL_SECONDS } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { User } from '@/lib/models/User';
import { completePlexLogin } from '@/lib/auth-login';
import { issueTokenPair, redactToken } from '@/lib/mobile-auth/tokens';
import { pollAuthPin } from '@/lib/services/plex-oauth';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { backfillSyncRevisions } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthExchange');

/**
 * Per-device-code budget, like the browser's per-pin poll limit: it caps how often one
 * sign-in can make us poll plex.tv without a shared per-IP bucket locking other users out.
 */
const EXCHANGE_RATE_LIMIT_CONFIG = {
  windowMs: AUTH_CODE_TTL_SECONDS * 1000,
  maxAttempts: 60,
  globalMaxAttempts: 5_000,
};

const bodyContract = z.object({
  deviceCode: z.string().min(1, 'deviceCode and deviceId are required'),
  deviceId: z.string().min(1, 'deviceCode and deviceId are required'),
});

export const POST = route({ access: 'public', body: bodyContract }, async ({ request, body }) => {
  try {
    const deviceCode = body.deviceCode.trim();
    const deviceId = body.deviceId.trim();

    if (!deviceCode || !deviceId) {
      return NextResponse.json({ error: 'deviceCode and deviceId are required' }, { status: 400 });
    }

    const authCode = await MobileAuthCode.findOne({ deviceCode });
    if (!authCode || authCode.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Authorization code expired or invalid', code: 'PLEX_PIN_EXPIRED' },
        { status: 401 }
      );
    }

    const rateLimitResponse = enforceRateLimit(
      request,
      'mobile-auth:exchange',
      EXCHANGE_RATE_LIMIT_CONFIG,
      deviceCode
    );
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for mobile auth exchange', {
        deviceCode: redactToken(deviceCode),
      });
      return rateLimitResponse;
    }

    if (authCode.exchangedAt) {
      return NextResponse.json({ error: 'Authorization code already used' }, { status: 401 });
    }

    if (authCode.deviceId !== deviceId) {
      return NextResponse.json({ error: 'Device mismatch' }, { status: 401 });
    }

    let plexToken = authCode.getDecryptedPlexAuthToken();
    if (!plexToken) {
      const pin = await pollAuthPin(authCode.pinId, authCode.pinCode);
      if (!pin.authToken) {
        return NextResponse.json(
          { error: 'Plex authorization not completed', authorized: false },
          { status: 202 }
        );
      }
      plexToken = pin.authToken;
      authCode.setEncryptedPlexAuthToken(plexToken);
      await authCode.save();
    }

    const loginResult = await completePlexLogin(plexToken);
    if (!loginResult.success || !loginResult.user) {
      return NextResponse.json(
        { error: loginResult.error || 'Login failed', code: loginResult.code || 'AUTH_FAILED' },
        { status: loginResult.status || 401 }
      );
    }

    const user = await User.findById(loginResult.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }

    await backfillSyncRevisions(user._id);

    const tokens = await issueTokenPair(user, deviceId, authCode.deviceName);
    authCode.exchangedAt = new Date();
    authCode.userId = user._id;
    // The Plex token now lives (encrypted) on the user; the one-time code no longer needs it.
    authCode.plexAuthToken = undefined;
    await authCode.save();

    logger.info('Mobile auth exchanged', {
      userId: user._id.toString(),
      deviceId,
      deviceCode: redactToken(deviceCode),
    });

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: loginResult.user,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Plex.tv is unavailable. Please try again later.', code: 'PLEX_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (msg === 'PLEX_PIN_EXPIRED' || msg === 'PLEX_PIN_INVALID') {
      return NextResponse.json(
        { error: 'Plex authorization expired or was invalid. Please try again.', code: 'PLEX_PIN_EXPIRED' },
        { status: 401 }
      );
    }
    logger.error('Mobile auth exchange failed', { error: msg });
    return NextResponse.json({ error: 'Failed to exchange authorization' }, { status: 500 });
  }
});
