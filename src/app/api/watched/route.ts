import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser();
    const mediaType = request.nextUrl.searchParams.get('mediaType');
    const rawPage = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.max(1, Math.min(200, isNaN(rawLimit) ? 50 : rawLimit));

    await connectDB();

    const query: Record<string, unknown> = { userId: auth.user._id };
    if (mediaType) {
      query.mediaType = mediaType;
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      WatchedItem.find(query).sort({ watchedAt: -1 }).skip(skip).limit(limit).lean(),
      WatchedItem.countDocuments(query),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Get watched error:', error);
    return NextResponse.json({ error: 'Failed to get watched items' }, { status: 500 });
  }
}
