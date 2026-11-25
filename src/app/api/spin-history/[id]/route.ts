import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { emitSyncChange } from '@/lib/sync/service';

const entryParams = z.object({
  id: z.string().refine((id) => mongoose.Types.ObjectId.isValid(id), 'Invalid history id'),
});

export const DELETE = route({ access: 'user', params: entryParams }, async ({ session, params }) => {
  const result = await SpinHistoryEntry.deleteOne({ _id: params.id, userId: session.userId });
  if (result.deletedCount === 0) {
    throw new DomainError('NOT_FOUND', 'History entry not found');
  }

  await emitSyncChange(session.userId, 'spin_history', params.id, 'delete', null);
  return NextResponse.json({ success: true });
});
