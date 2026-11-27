import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { User } from '@/lib/models/User';
import { PlexService } from '@/lib/services/plex';
import { issueSessionCookie } from '@/lib/auth-login';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AuthRefresh');

export const POST = route({ access: 'user' }, async ({ session }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  // Proves the user's server access token still works; a refusal surfaces as "sign in again".
  await new PlexService(session.plex.token, session.plex.serverUrl).getLibrarySections();

  user.tokenValidatedAt = new Date();
  await user.save();

  await issueSessionCookie(user);

  // Calculate expiry (7 days from now, matching issueSessionCookie)
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  logger.debug('Session refreshed', { username: user.plexUsername });
  return NextResponse.json({ success: true, expiresAt });
});
