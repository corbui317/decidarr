import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@decidarr/api-contracts';
import { IUser, User } from '@/lib/models/User';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { deriveKey } from '@/lib/secrets';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { MobileRefreshTokenFamily } from '@/lib/models/MobileRefreshTokenFamily';
import { createLogger } from '@/lib/logger';
import { SessionError } from '@/lib/auth-errors';
import { signSessionJwt, verifySessionJwt } from '@/lib/security/session-jwt';

const logger = createLogger('MobileAuth');

const MOBILE_AUDIENCE = 'decidarr-mobile';

interface MobileAccessClaims {
  sub: string;
  plexUserId: string;
  isAdmin: boolean;
  sessionVersion: number;
  deviceId: string;
  aud: string;
}

/** A verified mobile access token; `exp` is the Unix time (seconds) it expires. */
export interface MobileAccessPayload extends MobileAccessClaims {
  exp: number;
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
  const payload: MobileAccessClaims = {
    sub: user._id.toString(),
    plexUserId: user.plexUserId,
    isAdmin: user.isAdmin,
    sessionVersion: user.sessionVersion,
    deviceId,
    aud: MOBILE_AUDIENCE,
  };
  return signSessionJwt(payload, deriveKey('mobile-access-token'), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Verifies a mobile access token; throws SessionError('UNAUTHORIZED') for any invalid token. */
export async function verifyAccessToken(token: string): Promise<MobileAccessPayload> {
  let payload: MobileAccessPayload;
  try {
    payload = verifySessionJwt<MobileAccessPayload>(token, deriveKey('mobile-access-token'), {
      audience: MOBILE_AUDIENCE,
    });
  } catch {
    // Expired, tampered with, or signed before a DECIDARR_SECRET change.
    throw new SessionError('UNAUTHORIZED');
  }

  if (
    !payload.sub ||
    payload.sessionVersion === undefined ||
    !payload.deviceId ||
    typeof payload.exp !== 'number'
  ) {
    throw new SessionError('UNAUTHORIZED');
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

async function isFamilyCompromised(tokenFamily: string): Promise<boolean> {
  return (await MobileRefreshTokenFamily.exists({ tokenFamily })) !== null;
}

/**
 * Marks a family as compromised, durably and unconditionally: an upsert keyed only on
 * tokenFamily, not on any particular token's _id, so it is never missed by a race
 * against a sibling token's own creation. Also revokes whatever is currently
 * unrevoked in the family as a best effort, but every rotateRefreshToken call checks
 * the marker itself first, so a token created in the narrow window before this marker
 * lands is still refused the moment anyone tries to use it.
 */
async function markFamilyCompromised(
  tokenFamily: string,
  deviceId: string,
  userId: Types.ObjectId
): Promise<void> {
  await MobileRefreshTokenFamily.updateOne(
    { tokenFamily },
    { $setOnInsert: { compromisedAt: new Date() } },
    { upsert: true }
  );
  await MobileRefreshToken.updateMany(
    { tokenFamily, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
  logger.warn('Refresh token reuse detected; family revoked', {
    deviceId,
    userId: userId.toString(),
  });
}

export async function rotateRefreshToken(
  refreshToken: string,
  deviceId: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: IUser }> {
  const tokenHash = hashToken(refreshToken);
  const existing = await MobileRefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw new SessionError('UNAUTHORIZED');
  }

  // A replay of an already-rotated token, or any token from a family already flagged
  // compromised by a concurrent presentation elsewhere, revokes (or confirms revoked)
  // the whole family immediately - whatever else might also be wrong with this
  // particular request (wrong device, an unapproved user, no usable server token).
  if (existing.revokedAt || (await isFamilyCompromised(existing.tokenFamily))) {
    await markFamilyCompromised(existing.tokenFamily, existing.deviceId, existing.userId);
    throw new SessionError('UNAUTHORIZED');
  }

  if (existing.expiresAt < new Date()) {
    throw new SessionError('UNAUTHORIZED');
  }

  if (existing.deviceId !== deviceId) {
    throw new SessionError('UNAUTHORIZED');
  }

  const user = await User.findById(existing.userId);
  if (!user || (!user.isApproved && !user.isAdmin)) {
    throw new SessionError('UNAUTHORIZED');
  }
  let serverToken: string | null;
  try {
    serverToken = user.getServerToken((await getOrCreateSettings()).plexMachineId);
  } catch {
    // After a DECIDARR_SECRET change the device must sign in again; the token itself is kept.
    serverToken = null;
  }
  if (!serverToken) {
    throw new SessionError('PLEX_SIGN_IN_REQUIRED');
  }

  // Atomic swap: only the first caller to reach here for this token wins the rotation.
  // A concurrent duplicate presentation matches no document here and is treated as
  // reuse, revoking the whole family.
  const rotated = await MobileRefreshToken.findOneAndUpdate(
    { _id: existing._id, revokedAt: { $exists: false } },
    { revokedAt: new Date(), lastUsedAt: new Date() }
  );

  if (!rotated) {
    await markFamilyCompromised(existing.tokenFamily, deviceId, existing.userId);
    throw new SessionError('UNAUTHORIZED');
  }

  const newRefreshToken = generateOpaqueToken();
  const newTokenHash = hashToken(newRefreshToken);
  await MobileRefreshToken.create({
    userId: user._id,
    deviceId,
    deviceName: existing.deviceName,
    tokenHash: newTokenHash,
    tokenFamily: existing.tokenFamily,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  // Closes the window against a concurrent reuse detection that lands between the
  // swap above and this insert: if the family was marked compromised in that gap, the
  // successor just minted is dead on arrival too, not left to be discovered only on
  // its own next use.
  if (await isFamilyCompromised(existing.tokenFamily)) {
    await MobileRefreshToken.updateOne({ tokenHash: newTokenHash }, { revokedAt: new Date() });
    throw new SessionError('UNAUTHORIZED');
  }

  const accessToken = await signAccessToken(user, deviceId);
  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user,
  };
}

/** Revokes every refresh token this user holds, on every device (un-approval, security reset). */
export async function revokeAllRefreshTokensForUser(userId: Types.ObjectId): Promise<void> {
  const families = await MobileRefreshToken.distinct('tokenFamily', { userId });
  await Promise.all(
    families.map((tokenFamily) =>
      MobileRefreshTokenFamily.updateOne(
        { tokenFamily },
        { $setOnInsert: { compromisedAt: new Date() } },
        { upsert: true }
      )
    )
  );
  await MobileRefreshToken.updateMany(
    { userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
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
