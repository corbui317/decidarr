import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { rotateRefreshToken, redactToken } from '@/lib/mobile-auth/tokens';
import { isAuthError } from '@/lib/auth-errors';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthRefresh');

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json().catch(() => null);
    const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';

    if (!refreshToken || !deviceId) {
      return NextResponse.json({ error: 'refreshToken and deviceId are required' }, { status: 400 });
    }

    const tokens = await rotateRefreshToken(refreshToken, deviceId);

    logger.debug('Mobile token refreshed', {
      userId: tokens.user._id.toString(),
      deviceId,
      refreshToken: redactToken(refreshToken),
    });

    return NextResponse.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (err) {
    if (isAuthError(err)) {
      logger.warn('Mobile token refresh rejected', { code: err.code });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    logger.error('Mobile token refresh failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Failed to refresh session' }, { status: 500 });
  }
}
