import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import {
  createAuthPin,
  buildPlexAuthUrl,
  pollAuthPin,
} from '@/lib/services/plex-oauth';
import {
  authCodeExpiresAt,
  generateDeviceCode,
  redactToken,
} from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:MobileAuthStart');

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    await connectDB();
    const body = await request.json();
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim() : undefined;

    if (!deviceId || deviceId.length < 8) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    const pin = await createAuthPin();
    const deviceCode = generateDeviceCode();
    const expiresAt = authCodeExpiresAt();

    let forwardUrl: string | undefined;
    try {
      const origin = new URL(request.url).origin;
      forwardUrl = `${origin}/`;
    } catch {
      forwardUrl = undefined;
    }

    const authUrl = buildPlexAuthUrl(pin.code, { forwardUrl });

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
        { error: 'Plex.tv is unavailable. Please try again later.' },
        { status: 503 }
      );
    }
    logger.error('Mobile auth start failed', { error: msg });
    return NextResponse.json({ error: 'Failed to start authorization' }, { status: 500 });
  }
}
