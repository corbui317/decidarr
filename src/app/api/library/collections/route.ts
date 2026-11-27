import { NextResponse } from 'next/server';
import { libraryIdsQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:Collections');

export const GET = route({ access: 'user', query: libraryIdsQuerySchema }, async ({ session, query }) => {
  const ids = query.libraryIds?.split(',').filter(Boolean) ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ collections: [] });
  }

  const settings = await getOrCreateSettings();
  const allowed = await getAccessibleLibraryIds(
    {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    },
    ids
  );
  const plexService = new PlexService(session.plex.token, session.plex.serverUrl, settings.plexMachineId);

  const allCollections: { ratingKey: string; title: string; childCount: number; libraryId: string }[] = [];

  await Promise.all(
    allowed.map(async (libraryId) => {
      try {
        const collections = await plexService.getCollections(libraryId);
        for (const c of collections) {
          allCollections.push({
            ratingKey: c.ratingKey,
            title: c.title,
            childCount: c.childCount,
            libraryId,
          });
        }
      } catch (err) {
        logger.warn('Failed to get collections for library', { libraryId, error: (err as Error).message });
      }
    })
  );

  allCollections.sort((a, b) => a.title.localeCompare(b.title));

  logger.debug('Fetched collections', { libraryCount: ids.length, collectionCount: allCollections.length });

  return NextResponse.json({ collections: allCollections });
});
