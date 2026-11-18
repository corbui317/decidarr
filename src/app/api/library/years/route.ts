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
      return NextResponse.json({ min: 1900, max: new Date().getFullYear() });
    }

    const allowed = await getAccessibleLibraryIds(auth, ids);
    const machineId = auth.settings.plexMachineId || 'unknown';

    await connectDB();

    const caches = await LibraryCache.find({
      plexMachineId: machineId,
      libraryId: { $in: allowed },
    }).lean();

    const years: number[] = [];
    for (const cache of caches) {
      for (const item of cache.items) {
        if (item.year) years.push(item.year);
      }
    }

    if (years.length === 0) {
      return NextResponse.json({ min: 1900, max: new Date().getFullYear() });
    }

    return NextResponse.json({
      min: Math.min(...years),
      max: Math.max(...years),
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: (error as Error).message }, { status: authErrorStatus(error) });
    }
    console.error('Get years error:', error);
    return NextResponse.json({ error: 'Failed to get years' }, { status: 500 });
  }
}
