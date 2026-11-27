import { NextResponse } from 'next/server';
import { mobileAuthLogoutRequestSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { requireMobileUser, extractBearerToken } from '@/lib/mobile-auth/context';
import { revokeRefreshToken, redactToken, verifyAccessToken } from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthLogout');

export const POST = route({ access: 'public', body: mobileAuthLogoutRequestSchema }, async ({ request, body }) => {
  try {
    const refreshToken = body.refreshToken?.trim() || undefined;

    let deviceId: string | undefined;
    const bearer = extractBearerToken(request);
    if (bearer) {
      try {
        const payload = await verifyAccessToken(bearer);
        deviceId = payload.deviceId;
        const auth = await requireMobileUser(request);
        await revokeRefreshToken(refreshToken, auth.user._id, deviceId);
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

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Mobile logout failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
});
