import { NextResponse } from 'next/server';
import { mobileAuthStartRequestSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { buildPlexAuthUrl, createAuthPin } from '@/lib/services/plex-oauth';
import {
  authCodeExpiresAt,
  generateDeviceCode,
  redactToken,
} from '@/lib/mobile-auth/tokens';
import { resolveOAuthForwardUrl } from '@/lib/security/oauth-redirect';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthStart');

/** Same budget as the browser sign-in start (POST /api/auth/plex/start). */
export const POST = route(
  {
    access: 'public',
    body: mobileAuthStartRequestSchema,
    rateLimit: { scope: 'mobile-auth:start', windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  },
  async ({ request, body }) => {
    try {
      // A mobile sign-in on a server that has not finished setup would make the caller the
      // admin, so it needs the same setup secret as the browser flow.
      const setupCheck = await assertSetupSecretAllowed(request);
      if (!setupCheck.ok) {
        return NextResponse.json(
          { error: setupCheck.error, code: setupCheck.code },
          { status: setupCheck.status }
        );
      }

      const deviceId = body.deviceId.trim();
      const deviceName = body.deviceName?.trim() || undefined;

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
);
