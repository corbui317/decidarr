import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import {
  getCurrentUserId,
  getSpinHistoryPreferences,
  sanitizeFilterSnapshot,
  trimSpinHistoryToRetention,
} from '@/lib/spin-history';
import { createLogger } from '@/lib/logger';
import {
  containsPlexToken,
  plexImageUrl,
  resolveItemImageUrls,
  sanitizeThumbPathInput,
} from '@/lib/plex-image';

const logger = createLogger('API:SpinHistory');

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await connectDB();

    const userId = await getCurrentUserId();
    const rawPage = parseInt(request.nextUrl.searchParams.get('page') || '1', 10);
    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);
    const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.max(1, Math.min(100, Number.isNaN(rawLimit) ? 20 : rawLimit));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      SpinHistoryEntry.find({ userId }).sort({ spunAt: -1 }).skip(skip).limit(limit).lean(),
      SpinHistoryEntry.countDocuments({ userId }),
    ]);

    const safeItems = items.map((item) => {
      const images = resolveItemImageUrls(item);
      return {
        ...item,
        thumbPath: item.thumbPath || images.thumbPath,
        posterUrl: images.posterUrl || undefined,
      };
    });

    return NextResponse.json({
      items: safeItems,
      total,
      page,
      pageSize: limit,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('List spin history failed', { error: msg });
    return NextResponse.json({ error: 'Failed to list spin history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    await connectDB();

    const userId = await getCurrentUserId();
    const prefs = await getSpinHistoryPreferences();

    if (!prefs.enabled) {
      return NextResponse.json({ skipped: true, reason: 'disabled' });
    }

    const body = await request.json();
    const {
      plexId,
      title,
      mediaType,
      posterUrl,
      thumbPath,
      year,
      libraryIds = [],
      filtersSnapshot,
      tvSelectionMode,
      poolSizeAtSpin,
    } = body;

    if (!plexId || !title || !mediaType) {
      return NextResponse.json(
        { error: 'plexId, title, and mediaType are required' },
        { status: 400 }
      );
    }

    if (containsPlexToken(posterUrl) || (typeof posterUrl === 'string' && /^https?:\/\//i.test(posterUrl))) {
      return NextResponse.json(
        { error: 'posterUrl must not contain Plex tokens or absolute URLs' },
        { status: 400 }
      );
    }

    const safeThumbPath = sanitizeThumbPathInput(thumbPath);

    if (!['movie', 'show', 'episode'].includes(mediaType)) {
      return NextResponse.json({ error: 'Invalid mediaType' }, { status: 400 });
    }

    const entry = await SpinHistoryEntry.create({
      userId,
      plexId,
      title,
      mediaType,
      thumbPath: safeThumbPath,
      year,
      libraryIds: Array.isArray(libraryIds) ? libraryIds : [],
      filtersSnapshot:
        prefs.storeFilterSnapshot && filtersSnapshot
          ? sanitizeFilterSnapshot(filtersSnapshot)
          : undefined,
      tvSelectionMode,
      poolSizeAtSpin,
      spunAt: new Date(),
    });

    await trimSpinHistoryToRetention(userId, prefs.retentionLimit);

    const images = resolveItemImageUrls(entry.toObject());
    const safeEntry = {
      ...entry.toObject(),
      thumbPath: entry.thumbPath || images.thumbPath,
      posterUrl: images.posterUrl || undefined,
    };

    return NextResponse.json({ entry: safeEntry }, { status: 201 });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Create spin history failed', { error: msg });
    return NextResponse.json({ error: 'Failed to record spin history' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireAuth();
    await connectDB();

    const userId = await getCurrentUserId();
    const result = await SpinHistoryEntry.deleteMany({ userId });

    return NextResponse.json({ deleted: result.deletedCount ?? 0 });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Clear spin history failed', { error: msg });
    return NextResponse.json({ error: 'Failed to clear spin history' }, { status: 500 });
  }
}
