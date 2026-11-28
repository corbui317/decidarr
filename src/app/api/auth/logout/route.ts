import type { Types } from 'mongoose';
import { messageResponseSchema } from '@decidarr/api-contracts';
import { route, assertSameOrigin } from '@/lib/request/route';
import { clearSessionCookie } from '@/lib/auth-login';
import { invalidateAccessibleLibraryCache, readCookieSession } from '@/lib/auth';
import { extractBearerToken } from '@/lib/mobile-auth/context';
import { verifyAccessToken } from '@/lib/mobile-auth/tokens';
import { SessionError } from '@/lib/auth-errors';
import { User } from '@/lib/models/User';

type LogoutCredential = 'cookie' | 'bearer';

/**
 * Resolves the user to revoke on logout from identity alone - the cookie or bearer
 * token's own signature, absolute lifetime, and session version against the user's
 * current one - without going through the full Session seam, which also requires a
 * live, readable Plex server token. Whether this user's Plex token currently works is
 * irrelevant to whether their session must end; a session resolved as current here is
 * one worth revoking regardless of that.
 *
 * Only a SessionError - a missing, invalid, or expired credential - means there is
 * genuinely nothing to revoke. Any other failure (a database error reading the
 * credential or looking up the user) must propagate rather than be treated the same
 * way, or a transient failure could report a successful logout that revoked nothing.
 */
async function resolveLogoutIdentity(
  request: Request
): Promise<{ userId: Types.ObjectId; credential: LogoutCredential } | null> {
  const bearer = extractBearerToken(request);
  let payload: { sub: string; sessionVersion: number };
  try {
    payload = bearer ? await verifyAccessToken(bearer) : await readCookieSession();
  } catch (error) {
    if (error instanceof SessionError) {
      return null;
    }
    throw error;
  }

  const user = await User.findById(payload.sub);
  if (!user || user.sessionVersion !== payload.sessionVersion) {
    return null;
  }
  return { userId: user._id as Types.ObjectId, credential: bearer ? 'bearer' : 'cookie' };
}

export const DELETE = route({ access: 'public', response: messageResponseSchema }, async ({ request, reply }) => {
  const identity = await resolveLogoutIdentity(request);

  if (identity) {
    // A cookie is sent on cross-site requests too; logout now changes server state
    // (the session version bump below), so it needs the same same-origin proof any
    // other cookie-authenticated write does, or a forged cross-site request could
    // force a victim's browser to log them out.
    if (identity.credential === 'cookie') {
      assertSameOrigin(request);
    }

    invalidateAccessibleLibraryCache(String(identity.userId));
    // Bumping the session version is what actually ends the session: it makes every
    // outstanding token for this user, including the cookie this very request carried,
    // fail its next verification. Clearing the cookie alone only stops this browser from
    // resending it; a copy captured earlier would otherwise keep working. A failure here
    // must not be swallowed into a reported success, since the session would then stay live.
    await User.findByIdAndUpdate(identity.userId, { $inc: { sessionVersion: 1 } });
  }

  await clearSessionCookie();
  return reply({ message: 'Logged out successfully' });
});
