import { NextRequest } from 'next/server';
import { AuthContext, authContextForSession } from '@/lib/auth';
import { SessionError } from '@/lib/auth-errors';
import { connectDB } from '@/lib/db';
import { verifyAccessToken } from '@/lib/mobile-auth/tokens';
import { runMigrations } from '@/lib/migrate';

export function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Resolves the mobile caller from its bearer access token. Throws SessionError for a
 * missing, invalid, expired or revoked token, exactly like requireUser() does for cookies.
 */
export async function requireMobileUser(request: NextRequest | Request): Promise<AuthContext> {
  await connectDB();
  await runMigrations();

  const bearer = extractBearerToken(request);
  if (!bearer) {
    throw new SessionError('UNAUTHORIZED');
  }

  const payload = await verifyAccessToken(bearer);
  return authContextForSession({
    sub: payload.sub,
    plexUserId: payload.plexUserId,
    isAdmin: payload.isAdmin,
    sessionVersion: payload.sessionVersion,
    exp: payload.exp,
  });
}
