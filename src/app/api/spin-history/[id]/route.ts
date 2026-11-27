import { NextResponse } from 'next/server';
import { spinHistoryEntryParamsSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { emitSyncChange } from '@/lib/sync/service';

export const DELETE = route({ access: 'user', params: spinHistoryEntryParamsSchema }, async ({ session, params }) => {
  const result = await SpinHistoryEntry.deleteOne({ _id: params.id, userId: session.userId });
  if (result.deletedCount === 0) {
    throw new DomainError('NOT_FOUND', 'History entry not found');
  }

  await emitSyncChange(session.userId, 'spin_history', params.id, 'delete', null);
  return NextResponse.json({ success: true });
});
