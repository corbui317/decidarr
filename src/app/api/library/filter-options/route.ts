import { NextResponse } from 'next/server';
import { libraryIdsQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache } from '@/lib/models/LibraryCache';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user', query: libraryIdsQuerySchema }, async ({ session, query }) => {
  const libraryIds = query.libraryIds?.split(',') ?? [];

  if (libraryIds.length === 0) {
    return NextResponse.json({
      contentRatings: [],
      hasRatings: false,
      ratingRange: { min: 0, max: 10 },
      studios: [],
    });
  }

  const settings = await getOrCreateSettings();
  const allowed = await getAccessibleLibraryIds(
    {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    },
    libraryIds
  );
  const machineId = settings.plexMachineId || 'unknown';

  const caches = await LibraryCache.find({
    plexMachineId: machineId,
    libraryId: { $in: allowed },
  }).lean();

  const allItems = caches.flatMap((cache) => cache.items);

  const contentRatings = new Set<string>();
  const studios = new Set<string>();
  let minRating = 10;
  let maxRating = 0;
  let hasRatings = false;

  for (const item of allItems) {
    if (item.contentRating) {
      contentRatings.add(item.contentRating);
    }
    if (item.studio) {
      studios.add(item.studio);
    }
    if (item.rating !== undefined && item.rating !== null) {
      hasRatings = true;
      minRating = Math.min(minRating, item.rating);
      maxRating = Math.max(maxRating, item.rating);
    }
  }

  const ratingOrder = [
    'G', 'TV-G', 'TV-Y', 'TV-Y7',
    'PG', 'TV-PG',
    'PG-13', 'TV-14',
    'R', 'TV-MA', 'NC-17',
    'NR', 'Not Rated', 'Unrated',
  ];

  const sortedRatings = Array.from(contentRatings).sort((a, b) => {
    const aIndex = ratingOrder.findIndex((r) => a.toUpperCase().includes(r.toUpperCase()));
    const bIndex = ratingOrder.findIndex((r) => b.toUpperCase().includes(r.toUpperCase()));
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return NextResponse.json({
    contentRatings: sortedRatings,
    hasRatings,
    ratingRange: {
      min: hasRatings ? Math.floor(minRating) : 0,
      max: hasRatings ? Math.ceil(maxRating) : 10,
    },
    studios: Array.from(studios).sort(),
  });
});
