import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { parsePlexIdParam, parseWatchedCreateBody } from '@/lib/validation/watched';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ plexId: string }> }
) {
  try {
    const auth = await requireUser();
    const { plexId } = await params;
    const plexIdResult = parsePlexIdParam(plexId);
    if (!plexIdResult.ok) {
      return NextResponse.json({ error: plexIdResult.error }, { status: 400 });
    }

    await connectDB();

    const item = await WatchedItem.findOne({
      userId: auth.user._id,
      plexId: plexIdResult.data,
    }).lean();

    return NextResponse.json({ watched: !!item });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Get watched status error:', error);
    return NextResponse.json({ error: 'Failed to get watched status' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ plexId: string }> }
) {
  try {
    const auth = await requireUser();
    const { plexId } = await params;
    const plexIdResult = parsePlexIdParam(plexId);
    if (!plexIdResult.ok) {
      return NextResponse.json({ error: plexIdResult.error }, { status: 400 });
    }

    const parsed = parseWatchedCreateBody(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { mediaType, title } = parsed.data;

    await connectDB();

    const item = await WatchedItem.findOneAndUpdate(
      { userId: auth.user._id, plexId: plexIdResult.data },
      {
        mediaType,
        title,
        watchedAt: new Date(),
        markedManually: true,
        source: 'manual',
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ item });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Mark watched error:', error);
    return NextResponse.json({ error: 'Failed to mark as watched' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ plexId: string }> }
) {
  try {
    const auth = await requireUser();
    const { plexId } = await params;
    const plexIdResult = parsePlexIdParam(plexId);
    if (!plexIdResult.ok) {
      return NextResponse.json({ error: plexIdResult.error }, { status: 400 });
    }

    await connectDB();

    await WatchedItem.deleteOne({ userId: auth.user._id, plexId: plexIdResult.data });

    return NextResponse.json({ message: 'Marked as unwatched' });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: authErrorStatus(error) });
    }
    console.error('Mark unwatched error:', error);
    return NextResponse.json({ error: 'Failed to mark as unwatched' }, { status: 500 });
  }
}
