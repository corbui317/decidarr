import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getTmdbApiKey, getSyncFrequencyHours, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { enrichWithOverseerr } from '@/lib/services/overseerr-sync';
import type { ILibraryItem } from '@/lib/models/LibraryCache';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUser();
    const { id } = await params;
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === 'true';

    const allowed = await getAccessibleLibraryIds(auth, [id]);
    if (!allowed.includes(id)) {
      return NextResponse.json({ error: 'Library not found or access denied' }, { status: 403 });
    }

    const machineId = auth.settings.plexMachineId || 'unknown';
    await connectDB();

    const syncFrequencyHours = await getSyncFrequencyHours();

    if (!forceRefresh) {
      const cache = await LibraryCache.findOne({
        plexMachineId: machineId,
        libraryId: id,
      });

      if (cache && !cache.isExpired()) {
        return NextResponse.json({
          items: cache.items,
          fromCache: true,
          lastSyncedAt: cache.lastSyncedAt,
        });
      }
    }

    const plexService = new PlexService(
      auth.plexToken,
      auth.plexServerUrl,
      auth.settings.plexMachineId
    );
    const sections = await plexService.getLibrarySections();
    const section = sections.find((s) => s.id === id);

    if (!section) {
      return NextResponse.json({ error: 'Library not found' }, { status: 404 });
    }

    const items = (await plexService.getLibraryItems(id)) as ILibraryItem[];

    const existingCache = await LibraryCache.findOne({
      plexMachineId: machineId,
      libraryId: id,
    }).lean();

    const tmdbApiKey = await getTmdbApiKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      const enrichLimit = Math.min(items.length, 50);
      const itemsToEnrich = items.slice(0, enrichLimit) as unknown as Record<string, unknown>[];

      try {
        const enrichments = await tmdbService.enrichBatch(
          itemsToEnrich.map((item) => ({
            title: item.title as string,
            year: item.year as number | undefined,
            contentRating: item.contentRating as string | undefined,
            rating: item.rating as number | undefined,
            studio: item.studio as string | undefined,
          })),
          section.type as 'movie' | 'show'
        );

        enrichments.forEach((enrichment, i) => {
          const item = itemsToEnrich[i];
          if (enrichment.tmdbId && !item.tmdbId) {
            item.tmdbId = String(enrichment.tmdbId);
          }
          if (enrichment.certification && !item.contentRating) {
            item.contentRating = enrichment.certification;
          }
          if (enrichment.rating && !item.rating) {
            item.rating = enrichment.rating;
            item.tmdbRating = enrichment.rating;
          }
          if (!item.studio) {
            if (section.type === 'show' && enrichment.networks?.length) {
              item.studio = enrichment.networks[0];
              item.networks = enrichment.networks;
            } else if (enrichment.studios?.length) {
              item.studio = enrichment.studios[0];
              item.studios = enrichment.studios;
            }
          }
          item.enrichedAt = new Date();
        });

        for (let i = 0; i < items.length; i++) {
          const source = itemsToEnrich[i] as unknown as ILibraryItem | undefined;
          if (source?.tmdbId && !items[i].tmdbId) {
            items[i].tmdbId = source.tmdbId;
          }
        }
      } catch (err) {
        console.error('Batch enrichment error:', err);
      }
    }

    await enrichWithOverseerr(
      items,
      section.type as 'movie' | 'show',
      auth.settings,
      existingCache?.items
    );

    await LibraryCache.findOneAndUpdate(
      { plexMachineId: machineId, libraryId: id },
      {
        plexMachineId: machineId,
        libraryId: id,
        libraryName: section.title,
        mediaType: section.type,
        items,
        lastSyncedAt: new Date(),
        expiresAt: new Date(Date.now() + syncFrequencyHours * 60 * 60 * 1000),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      items,
      fromCache: false,
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Get library items error:', error);
    return NextResponse.json({ error: 'Failed to get library items' }, { status: 500 });
  }
}
