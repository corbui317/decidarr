import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getTmdbApiKey, getSyncFrequencyHours, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { enrichWithOverseerr } from '@/lib/services/overseerr-sync';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';

const ENRICHMENT_FIELDS = [
  'tmdbId',
  'contentRating',
  'rating',
  'tmdbRating',
  'studio',
  'networks',
  'studios',
  'enrichedAt',
  'overseerrStatus',
  'overseerrSyncedAt',
] as const;

function mergeExistingEnrichment(
  items: ILibraryItem[],
  existingItems?: ILibraryItem[]
): void {
  if (!existingItems?.length) return;

  const byPlexId = new Map(existingItems.map((item) => [item.plexId, item]));
  for (const item of items) {
    const existing = byPlexId.get(item.plexId);
    if (!existing) continue;

    for (const field of ENRICHMENT_FIELDS) {
      const freshValue = item[field];
      const existingValue = existing[field];
      const freshMissing =
        freshValue == null ||
        freshValue === '' ||
        (Array.isArray(freshValue) && freshValue.length === 0);

      if (freshMissing && existingValue != null) {
        (item as Record<string, unknown>)[field] = existingValue;
      }
    }
  }
}

function isItemUnenriched(item: ILibraryItem): boolean {
  return !item.enrichedAt || !item.tmdbId;
}

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
          items: cache.items.map((item) => sanitizeLibraryItemForClient(item as unknown as Record<string, unknown>)),
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

    mergeExistingEnrichment(items, existingCache?.items);

    const tmdbApiKey = await getTmdbApiKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      const unenrichedItems = items.filter(isItemUnenriched);
      const itemsToEnrich = unenrichedItems.slice(0, 50) as unknown as Record<string, unknown>[];

      if (itemsToEnrich.length > 0) {
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
            const enrichIndex = itemsToEnrich.findIndex(
              (candidate) => candidate.plexId === items[i].plexId
            );
            if (enrichIndex === -1) continue;
            const source = itemsToEnrich[enrichIndex] as unknown as ILibraryItem;
            if (source.tmdbId && !items[i].tmdbId) {
              items[i].tmdbId = source.tmdbId;
            }
            if (source.contentRating && !items[i].contentRating) {
              items[i].contentRating = source.contentRating;
            }
            if (source.rating && !items[i].rating) {
              items[i].rating = source.rating;
              items[i].tmdbRating = source.tmdbRating;
            }
            if (source.studio && !items[i].studio) {
              items[i].studio = source.studio;
            }
            if (source.networks?.length && !items[i].networks?.length) {
              items[i].networks = source.networks;
            }
            if (source.studios?.length && !items[i].studios?.length) {
              items[i].studios = source.studios;
            }
            if (source.enrichedAt) {
              items[i].enrichedAt = source.enrichedAt;
            }
          }
        } catch (err) {
          console.error('Batch enrichment error:', err);
        }
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
      items: items.map((item) => sanitizeLibraryItemForClient(item as unknown as Record<string, unknown>)),
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
