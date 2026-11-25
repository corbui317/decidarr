import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { User } from '@/lib/models/User';
import { createPlexService } from '@/lib/services/plex-factory';
import { issueSessionCookie } from '@/lib/auth-login';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AuthRefresh');

export const POST = route({ access: 'user' }, async ({ session }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const plexService = await createPlexService(session.plex.token);
  const validation = await plexService.validateToken();

  if (!validation.valid) {
    return NextResponse.json(
      { error: 'Your Plex session has expired. Please log in again.' },
      { status: 401 }
    );
  }

  user.tokenValidatedAt = new Date();
  await user.save();

  await issueSessionCookie(user);

  // Calculate expiry (7 days from now, matching issueSessionCookie)
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  logger.debug('Session refreshed', { username: user.plexUsername });
  return NextResponse.json({ success: true, expiresAt });
});
