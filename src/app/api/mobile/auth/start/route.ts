import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { buildPlexAuthUrl, createAuthPin } from '@/lib/services/plex-oauth';
import {
  authCodeExpiresAt,
  generateDeviceCode,
  redactToken,
} from '@/lib/mobile-auth/tokens';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { resolveOAuthForwardUrl } from '@/lib/security/oauth-redirect';
import { assertSetupSecretAllowed, extractSetupSecret } from '@/lib/security/setup-secret';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthStart');

/** Same budget as the browser sign-in start (POST /api/auth/plex/start). */
const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 5,
  globalMaxAttempts: 50,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceName = typeof body?.deviceName === 'string' ? body.deviceName.trim() : undefined;

    // Before setup completes, a guessed setup secret is the target being attacked. Otherwise
    // the device making the request is, so one device's failed attempts cannot lock out another.
    const target = extractSetupSecret(request) ?? (deviceId || undefined);
    const rateLimitResponse = enforceRateLimit(request, 'mobile-auth:start', RATE_LIMIT_CONFIG, target);
    if (rateLimitResponse) {
      logger.warn('Rate limit exceeded for mobile auth start');
      return rateLimitResponse;
    }

    await connectDB();

    // A mobile sign-in on a server that has not finished setup would make the caller the
    // admin, so it needs the same setup secret as the browser flow.
    const setupCheck = await assertSetupSecretAllowed(request);
    if (!setupCheck.ok) {
      return NextResponse.json(
        { error: setupCheck.error, code: setupCheck.code },
        { status: setupCheck.status }
      );
    }

    if (!deviceId || deviceId.length < 8) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const pin = await createAuthPin();
    const deviceCode = generateDeviceCode();
    const expiresAt = authCodeExpiresAt();

    const authUrl = buildPlexAuthUrl(pin.code, { forwardUrl: resolveOAuthForwardUrl(request) });

    await MobileAuthCode.create({
      deviceCode,
      deviceId,
      deviceName,
      pinId: pin.id,
      pinCode: pin.code,
      expiresAt,
    });

    logger.info('Mobile auth started', {
      deviceId,
      pinId: pin.id,
      deviceCode: redactToken(deviceCode),
    });

    return NextResponse.json({
      authUrl,
      pinId: pin.id,
      deviceCode,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'PLEX_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Plex.tv is unavailable. Please try again later.', code: 'PLEX_UNAVAILABLE' },
        { status: 503 }
      );
    }
    logger.error('Mobile auth start failed', { error: msg });
    return NextResponse.json({ error: 'Failed to start authorization' }, { status: 500 });
  }
}
