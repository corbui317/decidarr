import { NextResponse } from 'next/server';
import type { LibrarySectionsResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { PlexService } from '@/lib/services/plex';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:Sections');

export const GET = route({ access: 'user' }, async ({ session }) => {
  const settings = await getOrCreateSettings();
  const plexService = new PlexService(
    session.plex.token,
    session.plex.serverUrl,
    settings.plexMachineId || null
  );
  const sections = await plexService.getLibrarySections();

  const mediaLibraries = sections.filter((s) => s.type === 'movie' || s.type === 'show');

  logger.info('Fetched library sections', { count: mediaLibraries.length, user: session.plexUserId });
  const response: LibrarySectionsResponse = { sections: mediaLibraries };
  return NextResponse.json(response);
});
