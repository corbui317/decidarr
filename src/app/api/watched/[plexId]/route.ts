import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ plexId: string }> }
) {
  try {
    const auth = await requireUser();
    const { plexId } = await params;
    const { mediaType, title } = await request.json();

    await connectDB();

    const item = await WatchedItem.findOneAndUpdate(
      { userId: auth.user._id, plexId },
      {
        mediaType: mediaType || 'movie',
        title: title || 'Unknown',
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

    await connectDB();

    await WatchedItem.deleteOne({ userId: auth.user._id, plexId });

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
