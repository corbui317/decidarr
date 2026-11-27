import crypto from 'crypto';
import type { Types } from 'mongoose';
import type { SyncEntityType } from '@decidarr/api-contracts';
import { SyncChange } from '@/lib/models/SyncChange';
import { SyncEntityRevision } from '@/lib/models/SyncEntityRevision';

/**
 * Records one write in the user's change feed and returns the entity's new revision.
 * Only the user-data store calls this, so every write path emits the same changes.
 */
export async function emitSyncChange(
  userId: Types.ObjectId,
  entityType: SyncEntityType,
  entityId: string,
  operation: 'upsert' | 'delete',
  data: unknown | null
): Promise<number> {
  const deletion = operation === 'delete' ? { $set: { deletedAt: new Date() } } : { $unset: { deletedAt: 1 } };
  const { revision } = (await SyncEntityRevision.findOneAndUpdate(
    { userId, entityType, entityId },
    { $inc: { revision: 1 }, ...deletion },
    { upsert: true, new: true, setDefaultsOnInsert: false }
  ))!;

  await SyncChange.create({
    userId,
    cursor: crypto.randomBytes(16).toString('hex'),
    entityType,
    entityId,
    operation,
    revision,
    changedAt: new Date(),
    data,
  });
  return revision;
}
