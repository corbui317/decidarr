import { mobileAuthRefreshRequestSchema, mobileAuthRefreshResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { rotateRefreshToken, redactToken } from '@/lib/mobile-auth/tokens';
import { isAuthError } from '@/lib/auth-errors';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthRefresh');

export const POST = route(
  { access: 'public', body: mobileAuthRefreshRequestSchema, response: mobileAuthRefreshResponseSchema },
  async ({ body, reply }) => {
    try {
      const refreshToken = body.refreshToken.trim();
      const deviceId = body.deviceId.trim();

      if (!refreshToken || !deviceId) {
        return errorReply(400, { error: 'refreshToken and deviceId are required' });
      }

      const tokens = await rotateRefreshToken(refreshToken, deviceId);

      logger.debug('Mobile token refreshed', {
        userId: tokens.user._id.toString(),
        deviceId,
        refreshToken: redactToken(refreshToken),
      });

      return reply({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    } catch (err) {
      if (isAuthError(err)) {
        logger.warn('Mobile token refresh rejected', { code: err.code });
        return errorReply(err.status, { error: err.message, code: err.code });
      }
      logger.error('Mobile token refresh failed', { error: (err as Error).message });
      return errorReply(500, { error: 'Failed to refresh session' });
    }
  }
);
