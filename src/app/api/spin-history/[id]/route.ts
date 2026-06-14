import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { getCurrentUserId } from '@/lib/spin-history';
import { createLogger } from '@/lib/logger';
import mongoose from 'mongoose';

const logger = createLogger('API:SpinHistoryItem');

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    await connectDB();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid history id' }, { status: 400 });
    }

    const userId = await getCurrentUserId();
    const result = await SpinHistoryEntry.deleteOne({ _id: id, userId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'History entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error)) {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Delete spin history entry failed', { error: msg });
    return NextResponse.json({ error: 'Failed to delete history entry' }, { status: 500 });
  }
}
