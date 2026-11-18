import { NextRequest } from 'next/server';
import { AuthContext } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { loadUserWithToken } from '@/lib/models/User';
import { verifyAccessToken } from '@/lib/mobile-auth/tokens';
import { createLogger } from '@/lib/logger';
import { runMigrations } from '@/lib/migrate';

const logger = createLogger('MobileAuthContext');

export function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function requireMobileUser(request: NextRequest | Request): Promise<AuthContext> {
  await connectDB();
  await runMigrations();

  const bearer = extractBearerToken(request);
  if (!bearer) {
    throw new Error('Unauthorized');
  }

  const payload = await verifyAccessToken(bearer);
  const settings = await getOrCreateSettings();

  const user = await loadUserWithToken(payload.sub);
  if (!user) {
    logger.warn('Mobile auth failed: user not found', { sub: payload.sub });
    throw new Error('Unauthorized');
  }

  if (user.sessionVersion !== payload.sessionVersion) {
    logger.warn('Mobile auth failed: session revoked', { sub: payload.sub });
    throw new Error('Unauthorized');
  }

  if (!user.isApproved && !user.isAdmin) {
    throw new Error('Unauthorized');
  }

  if (!settings.plexServerUrl) {
    throw new Error('Plex server URL not configured');
  }

  let plexToken: string;
  try {
    plexToken = user.getDecryptedToken();
  } catch {
    throw new Error('Unauthorized');
  }

  return {
    user,
    settings,
    plexToken,
    plexServerUrl: settings.plexServerUrl,
    isAdmin: user.isAdmin,
  };
}
