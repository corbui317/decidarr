import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const libraryIds = request.nextUrl.searchParams.get('libraryIds')?.split(',') || [];

    if (libraryIds.length === 0) {
      return NextResponse.json({
        contentRatings: [],
        hasRatings: false,
        ratingRange: { min: 0, max: 10 },
        studios: [],
      });
    }

    const allowed = await getAccessibleLibraryIds(auth, libraryIds);
    const machineId = auth.settings.plexMachineId || 'unknown';

    await connectDB();

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
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: authErrorStatus(error) });
    }
    console.error('Get filter options error:', error);
    return NextResponse.json({ error: 'Failed to get filter options' }, { status: 500 });
  }
}
