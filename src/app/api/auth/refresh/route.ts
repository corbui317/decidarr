import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireUser, isAuthError } from '@/lib/auth';
import { createPlexService } from '@/lib/services/plex-factory';
import { issueSessionCookie } from '@/lib/auth-login';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AuthRefresh');

export async function POST() {
  try {
    await connectDB();
    const { user, plexToken } = await requireUser();

    const plexService = await createPlexService(plexToken);
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
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    logger.error('Refresh error', { error: (error as Error)?.message });
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
