import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Collections');

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();

    const libraryIds = request.nextUrl.searchParams.get('libraryIds');
    if (!libraryIds) {
      return NextResponse.json({ collections: [] });
    }

    const ids = libraryIds.split(',').filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    const allowed = await getAccessibleLibraryIds(auth, ids);
    const plexService = new PlexService(
      auth.plexToken,
      auth.plexServerUrl,
      auth.settings.plexMachineId
    );

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
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    logger.error('Get collections error', { error: msg });
    return NextResponse.json({ error: 'Failed to get collections' }, { status: 500 });
  }
}
