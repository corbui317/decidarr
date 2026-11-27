import type { Types } from 'mongoose';
import { AuthContext, authContextForSession, readCookieSession } from '@/lib/auth';
import { extractBearerToken } from '@/lib/mobile-auth/context';
import { verifyAccessToken } from '@/lib/mobile-auth/tokens';

export type CredentialOrigin = 'cookie' | 'bearer';

/**
 * Proof that a request comes from a specific Admin or Friend (see GLOSSARY.md).
 * The cookie and bearer adapters produce the same Session for the same user;
 * only `credential` says which one the request used.
 */
export interface Session {
  userId: Types.ObjectId;
  plexUserId: string;
  isAdmin: boolean;
  credential: CredentialOrigin;
  /** How this user reaches the configured Plex server: their per-server access token. Never send it to a client. */
  plex: { serverUrl: string; token: string };
  /** Unix timestamp (ms) when this session's underlying token expires. */
  expiresAt: number;
}

function toSession(ctx: AuthContext, credential: CredentialOrigin): Session {
  return {
    userId: ctx.user._id,
    plexUserId: ctx.user.plexUserId,
    isAdmin: ctx.isAdmin,
    credential,
    plex: { serverUrl: ctx.plexServerUrl, token: ctx.plexToken },
    expiresAt: ctx.expiresAt,
  };
}

/**
 * Resolves the request's Session. A bearer token, when present, is the credential
 * and is never silently replaced by a cookie. Throws SessionError when there is no
 * valid, unrevoked session for an approved user.
 */
export async function resolveSession(request: Request): Promise<Session> {
  const bearer = extractBearerToken(request);
  if (bearer) {
    const payload = await verifyAccessToken(bearer);
    return toSession(await authContextForSession(payload), 'bearer');
  }
  return toSession(await authContextForSession(await readCookieSession()), 'cookie');
}
