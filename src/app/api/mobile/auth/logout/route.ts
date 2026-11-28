import { mobileAuthLogoutRequestSchema, successResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { extractBearerToken } from '@/lib/mobile-auth/context';
import { resolveSession } from '@/lib/request/session';
import { revokeRefreshToken, redactToken, verifyAccessToken } from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthLogout');

export const POST = route(
  { access: 'public', body: mobileAuthLogoutRequestSchema, response: successResponseSchema },
  async ({ request, body, reply }) => {
    try {
      const refreshToken = body.refreshToken?.trim() || undefined;

      let deviceId: string | undefined;
      const bearer = extractBearerToken(request);
      if (bearer) {
        try {
          const payload = await verifyAccessToken(bearer);
          deviceId = payload.deviceId;
          const session = await resolveSession(request);
          await revokeRefreshToken(refreshToken, session.userId, deviceId);
        } catch {
          if (refreshToken) {
            await revokeRefreshToken(refreshToken);
          }
        }
      } else if (refreshToken) {
        await revokeRefreshToken(refreshToken);
      }

      logger.info('Mobile logout', {
        deviceId,
        refreshToken: redactToken(refreshToken),
      });

      return reply({ success: true });
    } catch (err) {
      logger.error('Mobile logout failed', { error: (err as Error).message });
      return errorReply(500, { error: 'Logout failed' });
    }
  }
);
