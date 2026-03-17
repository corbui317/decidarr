import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Collections');

export async function GET(request: NextRequest) {
  try {
    const { plexToken, plexServerUrl, settings } = await requireAuth();

    const libraryIds = request.nextUrl.searchParams.get('libraryIds');
    if (!libraryIds) {
      return NextResponse.json({ collections: [] });
    }

    const ids = libraryIds.split(',').filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    const plexService = new PlexService(plexToken, plexServerUrl, settings.plexMachineId);

    const allCollections: { ratingKey: string; title: string; childCount: number; libraryId: string }[] = [];

    await Promise.all(
      ids.map(async (libraryId) => {
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
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Get collections error', { error: msg });
    return NextResponse.json({ error: 'Failed to get collections' }, { status: 500 });
  }
}
