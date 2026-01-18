import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { LibraryCache } from '@/lib/models/LibraryCache';
import mongoose from 'mongoose';

// Use a constant ObjectId for single-user mode cache
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const libraryIds = request.nextUrl.searchParams.get('libraryIds');

    const ids = libraryIds
      ? libraryIds.split(',').filter((id) => /^[0-9a-zA-Z-]+$/.test(id.trim()))
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ genres: [] });
    }

    await connectDB();

    const caches = await LibraryCache.find({
      userId: SINGLE_USER_ID,
      libraryId: { $in: ids },
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
    if ((error as Error).message === 'App not configured') {
      return NextResponse.json({ error: 'App not configured' }, { status: 401 });
    }
    console.error('Get genres error:', error);
    return NextResponse.json(
      { error: 'Failed to get genres' },
      { status: 500 }
    );
  }
}
