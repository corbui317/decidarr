import {
  AUTH_CODE_TTL_SECONDS,
  mobileAuthExchangeRequestSchema,
  mobileAuthExchangeResponseSchema,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { User } from '@/lib/models/User';
import { completePlexLogin } from '@/lib/auth-login';
import { issueTokenPair, redactToken } from '@/lib/mobile-auth/tokens';
import { pollAuthPin } from '@/lib/services/plex-oauth';
import { isRateLimited } from '@/lib/security/rate-limit';
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

export const POST = route(
  { access: 'public', body: mobileAuthExchangeRequestSchema, response: mobileAuthExchangeResponseSchema },
  async ({ request, body, reply }) => {
    try {
      const deviceCode = body.deviceCode.trim();
      const deviceId = body.deviceId.trim();

      if (!deviceCode || !deviceId) {
        return errorReply(400, { error: 'deviceCode and deviceId are required' });
      }

      const authCode = await MobileAuthCode.findOne({ deviceCode });
      if (!authCode || authCode.expiresAt < new Date()) {
        return errorReply(401, { error: 'Authorization code expired or invalid', code: 'PLEX_PIN_EXPIRED' });
      }

      if (isRateLimited(request, 'mobile-auth:exchange', EXCHANGE_RATE_LIMIT_CONFIG, deviceCode)) {
        logger.warn('Rate limit exceeded for mobile auth exchange', {
          deviceCode: redactToken(deviceCode),
        });
        return errorReply(429, { error: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' });
      }

      if (authCode.exchangedAt) {
        return errorReply(401, { error: 'Authorization code already used' });
      }

      if (authCode.deviceId !== deviceId) {
        return errorReply(401, { error: 'Device mismatch' });
      }

      let plexToken = authCode.getDecryptedPlexAuthToken();
      if (!plexToken) {
        const pin = await pollAuthPin(authCode.pinId, authCode.pinCode);
        if (!pin.authToken) {
          return reply({ authorized: false, error: 'Plex authorization not completed' }, 202);
        }
        plexToken = pin.authToken;
        authCode.setEncryptedPlexAuthToken(plexToken);
        await authCode.save();
      }

      // Claim the code atomically before any Plex login or token issuance, so two concurrent
      // exchanges of the same device code can never both mint a token pair: only the request
      // whose update actually matches a not-yet-exchanged document wins. Released below unless
      // this exchange actually succeeds, so a pending authorization or a transient login
      // failure stays retryable exactly as it was before this code existed.
      const claimed = await MobileAuthCode.findOneAndUpdate(
        { _id: authCode._id, exchangedAt: { $exists: false } },
        { $set: { exchangedAt: new Date() } }
      );
      if (!claimed) {
        return errorReply(401, { error: 'Authorization code already used' });
      }

      try {
        const loginResult = await completePlexLogin(plexToken);
        if (!loginResult.success || !loginResult.user) {
          await MobileAuthCode.updateOne({ _id: authCode._id }, { $unset: { exchangedAt: 1 } });
          return errorReply(loginResult.status || 401, {
            error: loginResult.error || 'Login failed',
            code: loginResult.code || 'AUTH_FAILED',
          });
        }

        const user = await User.findById(loginResult.user.id);
        if (!user) {
          await MobileAuthCode.updateOne({ _id: authCode._id }, { $unset: { exchangedAt: 1 } });
          return errorReply(500, { error: 'User not found' });
        }

        await backfillSyncRevisions(user._id);

        const tokens = await issueTokenPair(user, deviceId, authCode.deviceName);
        // The Plex token now lives (encrypted) on the user; the one-time code no longer needs
        // it. exchangedAt was already set by the claim above.
        await MobileAuthCode.updateOne(
          { _id: authCode._id },
          { $set: { userId: user._id }, $unset: { plexAuthToken: 1 } }
        );

        logger.info('Mobile auth exchanged', {
          userId: user._id.toString(),
          deviceId,
          deviceCode: redactToken(deviceCode),
        });

        return reply({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          user: loginResult.user,
        });
      } catch (err) {
        await MobileAuthCode.updateOne({ _id: authCode._id }, { $unset: { exchangedAt: 1 } });
        throw err;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'PLEX_UNAVAILABLE') {
        return errorReply(503, { error: 'Plex.tv is unavailable. Please try again later.', code: 'PLEX_UNAVAILABLE' });
      }
      if (msg === 'PLEX_PIN_EXPIRED' || msg === 'PLEX_PIN_INVALID') {
        return errorReply(401, {
          error: 'Plex authorization expired or was invalid. Please try again.',
          code: 'PLEX_PIN_EXPIRED',
        });
      }
      logger.error('Mobile auth exchange failed', { error: msg });
      return errorReply(500, { error: 'Failed to exchange authorization' });
    }
});
