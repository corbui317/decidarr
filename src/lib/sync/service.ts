import crypto from 'crypto';
import { Types } from 'mongoose';
import type { SyncChange, SyncMutation, MutationResult, SYNC_SCHEMA_VERSION } from '@decidarr/api-contracts';
import { SYNC_CHANGE_RETENTION_DAYS } from '@decidarr/api-contracts';
import { SyncChange as SyncChangeModel } from '@/lib/models/SyncChange';
import { SyncEntityRevision } from '@/lib/models/SyncEntityRevision';
import { AppliedSyncMutation } from '@/lib/models/AppliedSyncMutation';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { IUser } from '@/lib/models/User';
import { DomainError } from '@/lib/request/errors';
import {
  deleteSpin,
  markWatched,
  recordSpin,
  toPreferenceContract,
  toSpinHistoryContract,
  toWatchedContract,
  unmarkWatched,
  updatePreferences,
  type UserDataActor,
} from '@/lib/user-data';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Sync');

export async function buildBootstrap(user: IUser) {
  const userId = user._id as Types.ObjectId;
  const [watched, spinHistory] = await Promise.all([
    WatchedItem.find({ userId }).sort({ watchedAt: -1 }).limit(500).lean(),
    SpinHistoryEntry.find({ userId }).sort({ spunAt: -1 }).limit(500).lean(),
  ]);

  const latestChange = await SyncChangeModel.findOne({ userId })
    .sort({ changedAt: -1 })
    .lean();

  return {
    schemaVersion: 1 as typeof SYNC_SCHEMA_VERSION,
    cursor: latestChange?.cursor ?? '',
    serverTime: new Date().toISOString(),
    entities: {
      preferences: toPreferenceContract(user),
      watched: watched.map(toWatchedContract),
      spinHistory: spinHistory.map(toSpinHistoryContract),
    },
  };
}

export async function getChanges(
  userId: Types.ObjectId,
  cursor: string | null,
  limit: number
): Promise<{ changes: SyncChange[]; nextCursor: string; hasMore: boolean }> {
  const retentionCutoff = new Date(
    Date.now() - SYNC_CHANGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  if (cursor) {
    const cursorDoc = await SyncChangeModel.findOne({ userId, cursor }).lean();
    if (!cursorDoc) {
      const error = new Error('full_resync_required');
      (error as Error & { statusCode?: number }).statusCode = 410;
      throw error;
    }
    if (cursorDoc.changedAt < retentionCutoff) {
      const error = new Error('full_resync_required');
      (error as Error & { statusCode?: number }).statusCode = 410;
      throw error;
    }
  }

  const query: Record<string, unknown> = { userId };
  if (cursor) {
    const cursorDoc = await SyncChangeModel.findOne({ userId, cursor }).lean();
    if (cursorDoc) {
      query.changedAt = { $gt: cursorDoc.changedAt };
    }
  }

  const docs = await SyncChangeModel.find(query)
    .sort({ changedAt: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  const changes: SyncChange[] = page.map((doc) => ({
    cursor: doc.cursor,
    entityType: doc.entityType,
    entityId: doc.entityId,
    operation: doc.operation,
    revision: doc.revision,
    changedAt: doc.changedAt.toISOString(),
    data: doc.data ?? null,
  }));

  const nextCursor = page.length > 0 ? page[page.length - 1].cursor : cursor ?? '';

  return { changes, nextCursor, hasMore };
}

function hashMutationResult(result: MutationResult): string {
  return crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
}

/** When the client made the change, never later than now. */
function clientTime(clientChangedAt: string): Date {
  return new Date(Math.min(Date.parse(clientChangedAt), Date.now()));
}

/** Hands one mutation to the user-data store, which validates and applies it exactly as the REST route would. */
async function applySingleMutation(
  actor: UserDataActor,
  mutation: SyncMutation
): Promise<{ revision: number; entityId?: string }> {
  switch (`${mutation.entityType}:${mutation.operation}`) {
    case 'preference:upsert':
      if (mutation.entityId !== actor.userId.toString()) {
        throw new DomainError('VALIDATION_FAILED', 'A preference mutation must name your own user id');
      }
      return updatePreferences(actor, mutation.payload);
    case 'watched:upsert':
      return markWatched(actor, mutation.entityId, mutation.payload, clientTime(mutation.clientChangedAt));
    case 'watched:delete':
      return unmarkWatched(actor, mutation.entityId);
    case 'spin_history:upsert': {
      const { entry, revision } = await recordSpin(actor, mutation.payload, clientTime(mutation.clientChangedAt));
      return { revision, entityId: entry?._id.toString() };
    }
    case 'spin_history:delete':
      return deleteSpin(actor, mutation.entityId);
    default:
      throw new DomainError('VALIDATION_FAILED', `Unsupported mutation: ${mutation.operation} ${mutation.entityType}`);
  }
}

/**
 * Applies a batch of mutations in order. This only keeps the sync bookkeeping:
 * a mutation id already seen is a duplicate, and a base revision that is no longer
 * current is a conflict. Every write, and every refusal, comes from the user-data store.
 */
export async function applyMutations(
  user: IUser,
  mutations: SyncMutation[]
): Promise<{ results: MutationResult[]; nextCursor: string }> {
  const userId = user._id as Types.ObjectId;
  const actor: UserDataActor = { userId, isAdmin: user.isAdmin };
  const results: MutationResult[] = [];

  const record = async (mutation: SyncMutation, result: MutationResult, revision: number | null) => {
    await AppliedSyncMutation.create({
      userId,
      mutationId: mutation.mutationId,
      deviceId: mutation.deviceId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      status: result.status,
      revision,
      conflictReason: result.status === 'conflict' ? result.reason : result.status === 'rejected' ? result.code : undefined,
      resultHash: hashMutationResult(result),
    });
    results.push(result);
  };

  for (const mutation of mutations) {
    const existing = await AppliedSyncMutation.findOne({ userId, mutationId: mutation.mutationId }).lean();
    if (existing) {
      results.push({ mutationId: mutation.mutationId, status: 'duplicate', revision: existing.revision ?? 0 });
      continue;
    }

    const entityRevision = await SyncEntityRevision.findOne({
      userId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
    }).lean();

    if (mutation.baseRevision !== null && entityRevision && entityRevision.revision !== mutation.baseRevision) {
      await record(
        mutation,
        {
          mutationId: mutation.mutationId,
          status: 'conflict',
          reason: entityRevision.deletedAt ? 'deleted' : 'revision_mismatch',
          serverRevision: entityRevision.revision,
          serverValue: null,
        },
        entityRevision.revision
      );
      continue;
    }

    try {
      const { revision, entityId } = await applySingleMutation(actor, mutation);
      await record(
        mutation,
        { mutationId: mutation.mutationId, status: 'applied', revision, ...(entityId ? { entityId } : {}) },
        revision
      );
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      await record(
        mutation,
        { mutationId: mutation.mutationId, status: 'rejected', code: err.code, error: err.message },
        entityRevision?.revision ?? null
      );
      logger.warn('Sync mutation rejected', { mutationId: mutation.mutationId, code: err.code });
    }
  }

  const latestChange = await SyncChangeModel.findOne({ userId }).sort({ changedAt: -1 }).lean();
  return { results, nextCursor: latestChange?.cursor ?? '' };
}

export async function backfillSyncRevisions(userId: Types.ObjectId): Promise<void> {
  const preferenceExists = await SyncEntityRevision.findOne({
    userId,
    entityType: 'preference',
    entityId: userId.toString(),
  });
  if (!preferenceExists) {
    await SyncEntityRevision.create({
      userId,
      entityType: 'preference',
      entityId: userId.toString(),
      revision: 1,
    });
  }
}
