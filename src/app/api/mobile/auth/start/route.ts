import { mobileAuthStartRequestSchema, mobileAuthStartResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { buildPlexAuthUrl, createAuthPin } from '@/lib/services/plex-oauth';
import {
  authCodeExpiresAt,
  generateDeviceCode,
  redactToken,
} from '@/lib/mobile-auth/tokens';
import { resolveOAuthForwardUrl } from '@/lib/security/oauth-redirect';
import { assertSetupSecretAllowed, isCorrectSetupSecret } from '@/lib/security/setup-secret';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthStart');

/** Same budget as the browser sign-in start (POST /api/auth/plex/start). */
export const POST = route(
  {
    access: 'public',
    body: mobileAuthStartRequestSchema,
    response: mobileAuthStartResponseSchema,
    // No per-guess target: a caller-chosen deviceId is not an attacked resource, and the
    // setup secret is a single shared one, so neither should become a bucket of its own.
    // Identity (when TRUST_PROXY makes it trustworthy) plus the ceiling well above household
    // use are this route's only protection.
    rateLimit: {
      scope: 'mobile-auth:start',
      windowMs: 15 * 60 * 1000,
      maxAttempts: 5,
      globalMaxAttempts: 50,
      // The correct setup secret is never rate limited; only wrong guesses count here.
      bypass: isCorrectSetupSecret,
    },
  },
  async ({ request, body, reply }) => {
    try {
      // A mobile sign-in on a server that has not finished setup would make the caller the
      // admin, so it needs the same setup secret as the browser flow.
      const setupCheck = await assertSetupSecretAllowed(request);
      if (!setupCheck.ok) {
        return errorReply(setupCheck.status, { error: setupCheck.error, code: setupCheck.code });
      }

      const deviceId = body.deviceId.trim();
      const deviceName = body.deviceName?.trim() || undefined;

      const pin = await createAuthPin();
      const deviceCode = generateDeviceCode();
      const expiresAt = authCodeExpiresAt();

      const authUrl = await buildPlexAuthUrl(pin.code, { forwardUrl: resolveOAuthForwardUrl(request) });

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

      return reply({
        authUrl,
        pinId: pin.id,
        deviceCode,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PLEX_UNAVAILABLE') {
        return errorReply(503, { error: 'Plex.tv is unavailable. Please try again later.', code: 'PLEX_UNAVAILABLE' });
      }
      logger.error('Mobile auth start failed', { error: msg });
      return errorReply(500, { error: 'Failed to start authorization' });
    }
  }
);
