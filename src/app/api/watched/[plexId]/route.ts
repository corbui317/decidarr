import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';
import mongoose from 'mongoose';

// Use a constant ObjectId for single-user mode
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ plexId: string }> }
) {
  try {
    await requireAuth();
    const { plexId } = await params;
    const { mediaType, title } = await request.json();

    await connectDB();

    const item = await WatchedItem.findOneAndUpdate(
      { userId: SINGLE_USER_ID, plexId },
      {
        mediaType: mediaType || 'movie',
        title: title || 'Unknown',
        watchedAt: new Date(),
        markedManually: true,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ item });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
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
    await requireAuth();
    const { plexId } = await params;

    await connectDB();

    await WatchedItem.deleteOne({ userId: SINGLE_USER_ID, plexId });

    return NextResponse.json({ message: 'Marked as unwatched' });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    console.error('Mark unwatched error:', error);
    return NextResponse.json({ error: 'Failed to mark as unwatched' }, { status: 500 });
  }
}
