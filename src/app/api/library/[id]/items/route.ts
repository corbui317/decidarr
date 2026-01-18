import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getTmdbApiKey, getSyncFrequencyHours } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import mongoose from 'mongoose';

// Use a constant ObjectId for single-user mode cache
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { plexToken, plexServerUrl } = await requireAuth();
    const { id } = await params;
    const forceRefresh = request.nextUrl.searchParams.get('forceRefresh') === 'true';

    await connectDB();

    // Get sync frequency from settings
    const syncFrequencyHours = await getSyncFrequencyHours();

    // Check cache first
    if (!forceRefresh) {
      const cache = await LibraryCache.findOne({
        userId: SINGLE_USER_ID,
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

    // Fetch from Plex
    const plexService = new PlexService(plexToken, plexServerUrl);
    const sections = await plexService.getLibrarySections();
    const section = sections.find((s) => s.id === id);

    if (!section) {
      return NextResponse.json(
        { error: 'Library not found' },
        { status: 404 }
      );
    }

    const items = await plexService.getLibraryItems(id);

    // Enrich with TMDb data for missing fields
    const tmdbApiKey = await getTmdbApiKey();
    if (tmdbApiKey) {
      const tmdbService = new TMDbService(tmdbApiKey);
      // Limit enrichment to avoid API rate limits (40 requests/10 seconds for TMDb)
      const enrichLimit = Math.min(items.length, 50);

      for (let i = 0; i < enrichLimit; i++) {
        const item = items[i] as any;
        try {
          // Enrich missing data from TMDb
          const enrichment = await tmdbService.enrichPlexItem(
            item.title,
            item.year,
            section.type as 'movie' | 'show',
            {
              contentRating: item.contentRating,
              rating: item.rating,
              studio: item.studio,
            }
          );

          // Apply enrichment data
          if (enrichment.certification && !item.contentRating) {
            item.contentRating = enrichment.certification;
          }
          if (enrichment.rating && !item.rating) {
            item.rating = enrichment.rating;
            item.tmdbRating = enrichment.rating;
          }
          if (!item.studio) {
            // For TV, prefer networks
            if (section.type === 'show' && enrichment.networks?.length) {
              item.studio = enrichment.networks[0];
              item.networks = enrichment.networks;
            } else if (enrichment.studios?.length) {
              item.studio = enrichment.studios[0];
              item.studios = enrichment.studios;
            }
          }
          item.enrichedAt = new Date();
        } catch (err) {
          // Skip failed enrichments, continue with Plex data
          console.error(`Failed to enrich ${item.title}:`, err);
        }
      }
    }

    // Update cache with configurable expiration
    await LibraryCache.findOneAndUpdate(
      { userId: SINGLE_USER_ID, libraryId: id },
      {
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
    if ((error as Error).message === 'App not configured') {
      return NextResponse.json({ error: 'App not configured' }, { status: 401 });
    }
    console.error('Get library items error:', error);
    return NextResponse.json(
      { error: 'Failed to get library items' },
      { status: 500 }
    );
  }
}
