import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@decidarr/api-contracts';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { IUser, loadUserWithToken } from '@/lib/models/User';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { createLogger } from '@/lib/logger';

const logger = createLogger('MobileAuth');

const MOBILE_AUDIENCE = 'decidarr-mobile';

export interface MobileAccessPayload {
  sub: string;
  plexUserId: string;
  isAdmin: boolean;
  sessionVersion: number;
  deviceId: string;
  aud: string;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateDeviceCode(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function generateTokenFamily(): string {
  return crypto.randomUUID();
}

export async function signAccessToken(
  user: IUser,
  deviceId: string
): Promise<string> {
  const settings = await getOrCreateSettings();
  const payload: MobileAccessPayload = {
    sub: user._id.toString(),
    plexUserId: user.plexUserId,
    isAdmin: user.isAdmin,
    sessionVersion: user.sessionVersion,
    deviceId,
    aud: MOBILE_AUDIENCE,
  };
  return jwt.sign(payload, settings.getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export async function verifyAccessToken(token: string): Promise<MobileAccessPayload> {
  const settings = await getOrCreateSettings();
  const payload = jwt.verify(token, settings.getJwtSecret(), {
    audience: MOBILE_AUDIENCE,
  }) as MobileAccessPayload;

  if (!payload.sub || payload.sessionVersion === undefined || !payload.deviceId) {
    throw new Error('Unauthorized');
  }

  return payload;
}

export async function issueTokenPair(
  user: IUser,
  deviceId: string,
  deviceName?: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = await signAccessToken(user, deviceId);
  const refreshToken = generateOpaqueToken();
  const tokenFamily = generateTokenFamily();

  await MobileRefreshToken.create({
    userId: user._id,
    deviceId,
    deviceName,
    tokenHash: hashToken(refreshToken),
    tokenFamily,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

export async function rotateRefreshToken(
  refreshToken: string,
  deviceId: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: IUser }> {
  const tokenHash = hashToken(refreshToken);
  const existing = await MobileRefreshToken.findOne({ tokenHash });

  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    if (existing?.revokedAt) {
      await MobileRefreshToken.updateMany(
        { tokenFamily: existing.tokenFamily },
        { revokedAt: new Date() }
      );
      logger.warn('Refresh token reuse detected; family revoked', {
        deviceId: existing.deviceId,
        userId: existing.userId.toString(),
      });
    }
    throw new Error('Unauthorized');
  }

  if (existing.deviceId !== deviceId) {
    throw new Error('Unauthorized');
  }

  const user = await loadUserWithToken(existing.userId);
  if (!user || !user.isApproved && !user.isAdmin) {
    throw new Error('Unauthorized');
  }

  existing.revokedAt = new Date();
  existing.lastUsedAt = new Date();
  await existing.save();

  const newRefreshToken = generateOpaqueToken();
  await MobileRefreshToken.create({
    userId: user._id,
    deviceId,
    deviceName: existing.deviceName,
    tokenHash: hashToken(newRefreshToken),
    tokenFamily: existing.tokenFamily,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  const accessToken = await signAccessToken(user, deviceId);
  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user,
  };
}

export async function revokeRefreshToken(
  refreshToken: string | undefined,
  userId?: Types.ObjectId,
  deviceId?: string
): Promise<void> {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await MobileRefreshToken.updateOne(
      { tokenHash },
      { revokedAt: new Date() }
    );
    return;
  }

  if (userId && deviceId) {
    await MobileRefreshToken.updateMany(
      { userId, deviceId, revokedAt: { $exists: false } },
      { revokedAt: new Date() }
    );
  }
}

export function authCodeExpiresAt(): Date {
  return new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);
}

export function redactToken(value: string | undefined): string {
  if (!value) return '[redacted]';
  if (value.length <= 8) return '[redacted]';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
