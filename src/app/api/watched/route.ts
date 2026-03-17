import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';
import mongoose from 'mongoose';

// Use a constant ObjectId for single-user mode
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const mediaType = request.nextUrl.searchParams.get('mediaType');
    const rawPage = parseInt(request.nextUrl.searchParams.get('page') || '1');
    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
    const limit = Math.max(1, Math.min(200, isNaN(rawLimit) ? 50 : rawLimit));

    await connectDB();

    const query: any = { userId: SINGLE_USER_ID };
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
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Get watched error:', error);
    return NextResponse.json({ error: 'Failed to get watched items' }, { status: 500 });
  }
}
