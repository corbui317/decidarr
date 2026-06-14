import { NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { connectDB } from '@/lib/db';

const logger = createLogger('API:Sections');

export async function GET() {
  try {
    await connectDB();
    logger.debug('Fetching library sections');
    const auth = await requireUser();

    const plexService = new PlexService(
      auth.plexToken,
      auth.plexServerUrl,
      auth.settings.plexMachineId || null
    );
    const sections = await plexService.getLibrarySections();

    const mediaLibraries = sections.filter(
      (s) => s.type === 'movie' || s.type === 'show'
    );

    logger.info('Fetched library sections', { count: mediaLibraries.length, user: auth.user.plexUsername });
    return NextResponse.json({ sections: mediaLibraries });
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (isAuthError(error)) {
      logger.warn('Auth error fetching sections', { error: errorMsg });
      return NextResponse.json(
        { error: errorMsg === 'Unauthorized' ? 'Session expired' : errorMsg },
        { status: authErrorStatus(error) }
      );
    }

    logger.error('Failed to get library sections', { error: errorMsg });
    return NextResponse.json(
      { error: `Failed to get library sections: ${errorMsg}` },
      { status: 500 }
    );
  }
}
