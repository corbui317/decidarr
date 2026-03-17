import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Sections');

export async function GET() {
  try {
    logger.debug('Fetching library sections');
    const { plexToken, plexServerUrl } = await requireAuth();

    logger.debug('Auth successful, connecting to Plex', { serverUrl: plexServerUrl });
    const plexService = new PlexService(plexToken, plexServerUrl);
    const sections = await plexService.getLibrarySections();

    const mediaLibraries = sections.filter(
      (s) => s.type === 'movie' || s.type === 'show'
    );

    logger.info('Fetched library sections', { count: mediaLibraries.length });
    return NextResponse.json({ sections: mediaLibraries });
  } catch (error) {
    const errorMsg = (error as Error).message;
    
    if (isAuthError(error)) {
      logger.warn('Auth error fetching sections', { error: errorMsg });
      return NextResponse.json(
        { error: errorMsg === 'Unauthorized' ? 'Session expired' : errorMsg },
        { status: 401 }
      );
    }
    
    logger.error('Failed to get library sections', { error: errorMsg });
    return NextResponse.json(
      { error: `Failed to get library sections: ${errorMsg}` },
      { status: 500 }
    );
  }
}
