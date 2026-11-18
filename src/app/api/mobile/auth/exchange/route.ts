import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { completePlexLogin } from '@/lib/auth-login';
import { issueTokenPair, redactToken } from '@/lib/mobile-auth/tokens';
import { pollAuthPin } from '@/lib/services/plex-oauth';
import { backfillSyncRevisions } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthExchange');

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const deviceCode = typeof body.deviceCode === 'string' ? body.deviceCode.trim() : '';
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';

    if (!deviceCode || !deviceId) {
      return NextResponse.json({ error: 'deviceCode and deviceId are required' }, { status: 400 });
    }

    const authCode = await MobileAuthCode.findOne({ deviceCode });
    if (!authCode || authCode.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Authorization code expired or invalid' }, { status: 401 });
    }

    if (authCode.exchangedAt) {
      return NextResponse.json({ error: 'Authorization code already used' }, { status: 401 });
    }

    if (authCode.deviceId !== deviceId) {
      return NextResponse.json({ error: 'Device mismatch' }, { status: 401 });
    }

    let plexToken = authCode.plexAuthToken;
    if (!plexToken) {
      const pin = await pollAuthPin(authCode.pinId, authCode.pinCode);
      if (!pin.authToken) {
        return NextResponse.json(
          { error: 'Plex authorization not completed', authorized: false },
          { status: 202 }
        );
      }
      plexToken = pin.authToken;
      authCode.plexAuthToken = plexToken;
      await authCode.save();
    }

    const loginResult = await completePlexLogin(plexToken);
    if (!loginResult.success || !loginResult.user) {
      return NextResponse.json(
        { error: loginResult.error || 'Login failed' },
        { status: loginResult.status || 401 }
      );
    }

    const { User } = await import('@/lib/models/User');
    const user = await User.findById(loginResult.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }

    await backfillSyncRevisions(user._id);

    const tokens = await issueTokenPair(user, deviceId, authCode.deviceName);
    authCode.exchangedAt = new Date();
    authCode.userId = user._id;
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
    if (msg === 'PLEX_UNAVAILABLE' || msg === 'PLEX_PIN_EXPIRED') {
      return NextResponse.json({ error: 'Plex authorization failed' }, { status: 401 });
    }
    logger.error('Mobile auth exchange failed', { error: msg });
    return NextResponse.json({ error: 'Failed to exchange authorization' }, { status: 500 });
  }
}
