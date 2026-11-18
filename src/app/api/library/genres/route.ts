import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getAccessibleLibraryIds, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const libraryIds = request.nextUrl.searchParams.get('libraryIds');

    const ids = libraryIds
      ? libraryIds.split(',').filter((id) => /^[0-9a-zA-Z-]+$/.test(id.trim()))
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ genres: [] });
    }

    const allowed = await getAccessibleLibraryIds(auth, ids);
    const machineId = auth.settings.plexMachineId || 'unknown';

    await connectDB();

    const caches = await LibraryCache.find({
      plexMachineId: machineId,
      libraryId: { $in: allowed },
    }).lean();

    const genres = new Set<string>();
    for (const cache of caches) {
      for (const item of cache.items) {
        if (item.genres) {
          item.genres.forEach((g) => genres.add(g));
        }
      }
    }

    return NextResponse.json({ genres: Array.from(genres).sort() });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: authErrorStatus(error) });
    }
    console.error('Get genres error:', error);
    return NextResponse.json({ error: 'Failed to get genres' }, { status: 500 });
  }
}
