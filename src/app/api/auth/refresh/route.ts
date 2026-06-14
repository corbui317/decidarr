import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { issueSessionCookie } from '@/lib/auth-login';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AuthRefresh');

export async function POST() {
  try {
    await connectDB();
    const { user, settings, plexToken } = await requireUser();

    const plexService = new PlexService(plexToken);
    const validation = await plexService.validateToken();

    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Your Plex session has expired. Please log in again.' },
        { status: 401 }
      );
    }

    user.tokenValidatedAt = new Date();
    await user.save();

    await issueSessionCookie(user, settings.getJwtSecret());

    logger.debug('Session refreshed', { username: user.plexUsername });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'Unauthorized' || msg === 'App not configured') {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    logger.error('Refresh error', { error: msg });
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 });
  }
}
