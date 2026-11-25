import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { enrichWithOverseerr } from '@/lib/services/overseerr-sync';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:LibraryItems');

const itemsParams = z.object({ id: z.string().min(1) });
const itemsQuery = z.object({ forceRefresh: z.string().optional() });

const ENRICHMENT_FIELDS = [
  'tmdbId',
  'contentRating',
  'rating',
  'tmdbRating',
  'studio',
  'networks',
  'studios',
  'enrichedAt',
  'attemptedEnrichmentAt',
  'overseerrStatus',
  'overseerrSyncedAt',
] as const;

function copyField<K extends keyof ILibraryItem>(target: ILibraryItem, source: ILibraryItem, field: K): void {
  target[field] = source[field];
}

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
        copyField(item, existing, field);
      }
    }
  }
}

const ENRICHMENT_RETRY_HOURS = 24;

function isItemUnenriched(item: ILibraryItem): boolean {
  if (item.enrichedAt && item.tmdbId) {
    return false;
  }

  if (item.attemptedEnrichmentAt) {
    const hoursSinceAttempt = (Date.now() - item.attemptedEnrichmentAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceAttempt < ENRICHMENT_RETRY_HOURS) {
      return false;
    }
  }

  return true;
}

export const GET = route(
  { access: 'user', params: itemsParams, query: itemsQuery },
  async ({ session, params, query }) => {
    const { id } = params;
    const forceRefresh = query.forceRefresh === 'true';

    const settings = await getOrCreateSettings();
    const libraryAccess = {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    };
    const allowed = await getAccessibleLibraryIds(libraryAccess, [id]);
    if (!allowed.includes(id)) {
      throw new DomainError('FORBIDDEN', 'Library not found or access denied');
    }

    const machineId = settings.plexMachineId || 'unknown';
    const syncFrequencyHours = settings.syncFrequencyHours;

    if (!forceRefresh) {
      const cache = await LibraryCache.findOne({
        plexMachineId: machineId,
        libraryId: id,
      });

      if (cache && !cache.isExpired()) {
        return NextResponse.json({
          items: cache.toObject().items.map(sanitizeLibraryItemForClient),
          fromCache: true,
          lastSyncedAt: cache.lastSyncedAt,
        });
      }
    }

    const plexService = new PlexService(
      session.plex.token,
      session.plex.serverUrl,
      settings.plexMachineId
    );
    const sections = await plexService.getLibrarySections();
    const section = sections.find((s) => s.id === id);

    if (!section) {
      throw new DomainError('NOT_FOUND', 'Library not found');
    }

    const items = (await plexService.getLibraryItems(id)) as ILibraryItem[];

    const existingCache = await LibraryCache.findOne({
      plexMachineId: machineId,
      libraryId: id,
    }).lean();

    mergeExistingEnrichment(items, existingCache?.items);

    const tmdbApiKey = settings.getDecryptedTmdbKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      const unenrichedItems = items.filter(isItemUnenriched);
      const itemsToEnrich = unenrichedItems.slice(0, 50);

      if (itemsToEnrich.length > 0) {
        try {
          const enrichments = await tmdbService.enrichBatch(
            itemsToEnrich.map((item) => ({
              title: item.title,
              year: item.year,
              contentRating: item.contentRating,
              rating: item.rating,
              studio: item.studio,
            })),
            section.type as 'movie' | 'show'
          );

          enrichments.forEach((enrichment, i) => {
            const item = itemsToEnrich[i];
            let enriched = false;

            if (enrichment.tmdbId && !item.tmdbId) {
              item.tmdbId = String(enrichment.tmdbId);
              enriched = true;
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

            if (enriched) {
              item.enrichedAt = new Date();
            } else {
              item.attemptedEnrichmentAt = new Date();
            }
          });

          for (let i = 0; i < items.length; i++) {
            const enrichIndex = itemsToEnrich.findIndex(
              (candidate) => candidate.plexId === items[i].plexId
            );
            if (enrichIndex === -1) continue;
            const source = itemsToEnrich[enrichIndex];
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
          logger.error('Batch enrichment error', { error: (err as Error).message });
        }
      }
    }

    await enrichWithOverseerr(
      items,
      section.type as 'movie' | 'show',
      settings,
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
      items: items.map(sanitizeLibraryItemForClient),
      fromCache: false,
      lastSyncedAt: new Date(),
    });
  }
);
