import crypto from 'crypto';
import { Types } from 'mongoose';
import type {
  PreferenceContract,
  SpinHistoryContract,
  SyncChange,
  SyncEntityType,
  SyncMutation,
  WatchedContract,
  MutationResult,
  SYNC_SCHEMA_VERSION,
} from '@decidarr/api-contracts';
import { SYNC_CHANGE_RETENTION_DAYS, MAX_MUTATION_BATCH_SIZE } from '@decidarr/api-contracts';
import { SyncChange as SyncChangeModel } from '@/lib/models/SyncChange';
import { SyncEntityRevision } from '@/lib/models/SyncEntityRevision';
import { AppliedSyncMutation } from '@/lib/models/AppliedSyncMutation';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { IUser } from '@/lib/models/User';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Sync');

function generateCursor(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function getNextRevision(
  userId: Types.ObjectId,
  entityType: SyncEntityType,
  entityId: string
): Promise<number> {
  const existing = await SyncEntityRevision.findOne({ userId, entityType, entityId });
  if (existing) {
    existing.revision += 1;
    existing.updatedAt = new Date();
    existing.deletedAt = undefined;
    await existing.save();
    return existing.revision;
  }

  await SyncEntityRevision.create({
    userId,
    entityType,
    entityId,
    revision: 1,
  });
  return 1;
}

export async function emitSyncChange(
  userId: Types.ObjectId,
  entityType: SyncEntityType,
  entityId: string,
  operation: 'upsert' | 'delete',
  data: unknown | null
): Promise<void> {
  const revision = await getNextRevision(userId, entityType, entityId);

  if (operation === 'delete') {
    await SyncEntityRevision.updateOne(
      { userId, entityType, entityId },
      { deletedAt: new Date() }
    );
  }

  await SyncChangeModel.create({
    userId,
    cursor: generateCursor(),
    entityType,
    entityId,
    operation,
    revision,
    changedAt: new Date(),
    data,
  });
}

export function toPreferenceContract(user: IUser): PreferenceContract {
  return {
    theme: user.preferences?.theme,
    selectedLibraries: user.preferences?.selectedLibraries,
    defaultMediaType: user.preferences?.defaultMediaType,
    tvSelectionMode: user.preferences?.tvSelectionMode,
    animationStyle: user.preferences?.animationStyle,
    animationSpeed: user.preferences?.animationSpeed,
    savedFilters: user.preferences?.savedFilters,
    spinHistory: user.preferences?.spinHistory
      ? {
          enabled: user.preferences.spinHistory.enabled ?? true,
          retentionLimit: user.preferences.spinHistory.retentionLimit ?? 50,
          storeFilterSnapshot: user.preferences.spinHistory.storeFilterSnapshot ?? true,
        }
      : undefined,
  };
}

export function toWatchedContract(item: {
  _id: Types.ObjectId | string;
  plexId: string;
  mediaType: 'movie' | 'show' | 'episode';
  title: string;
  watchedAt: Date;
  markedManually: boolean;
  source: 'manual' | 'tautulli';
}): WatchedContract {
  return {
    id: item._id.toString(),
    plexId: item.plexId,
    mediaType: item.mediaType,
    title: item.title,
    watchedAt: item.watchedAt.toISOString(),
    markedManually: item.markedManually,
    source: item.source,
  };
}

export function toSpinHistoryContract(item: {
  _id: Types.ObjectId | string;
  plexId: string;
  title: string;
  mediaType: 'movie' | 'show' | 'episode';
  thumbPath?: string;
  year?: number;
  libraryIds?: string[];
  filtersSnapshot?: Record<string, unknown>;
  tvSelectionMode?: 'show' | 'episode';
  poolSizeAtSpin?: number;
  spunAt: Date;
}): SpinHistoryContract {
  return {
    id: item._id.toString(),
    plexId: item.plexId,
    title: item.title,
    mediaType: item.mediaType,
    thumbPath: item.thumbPath,
    year: item.year,
    libraryIds: item.libraryIds ?? [],
    filtersSnapshot: item.filtersSnapshot,
    tvSelectionMode: item.tvSelectionMode,
    poolSizeAtSpin: item.poolSizeAtSpin,
    spunAt: item.spunAt.toISOString(),
  };
}

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

export function validateMutationBatch(mutations: unknown): SyncMutation[] {
  if (!Array.isArray(mutations)) {
    throw new Error('mutations must be an array');
  }
  if (mutations.length === 0 || mutations.length > MAX_MUTATION_BATCH_SIZE) {
    throw new Error(`mutations must contain 1-${MAX_MUTATION_BATCH_SIZE} items`);
  }
  return mutations as SyncMutation[];
}

export async function applyMutations(
  user: IUser,
  mutations: SyncMutation[]
): Promise<{ results: MutationResult[]; nextCursor: string }> {
  const userId = user._id as Types.ObjectId;
  const results: MutationResult[] = [];

  for (const mutation of mutations) {
    const existing = await AppliedSyncMutation.findOne({
      userId,
      mutationId: mutation.mutationId,
    }).lean();

    if (existing) {
      results.push({
        mutationId: mutation.mutationId,
        status: 'duplicate',
        revision: existing.revision ?? 0,
      });
      continue;
    }

    const entityRevision = await SyncEntityRevision.findOne({
      userId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
    }).lean();

    if (
      mutation.baseRevision !== null &&
      entityRevision &&
      entityRevision.revision !== mutation.baseRevision
    ) {
      const conflict: MutationResult = {
        mutationId: mutation.mutationId,
        status: 'conflict',
        reason: entityRevision.deletedAt ? 'deleted' : 'revision_mismatch',
        serverRevision: entityRevision.revision,
        serverValue: null,
      };
      await AppliedSyncMutation.create({
        userId,
        mutationId: mutation.mutationId,
        deviceId: mutation.deviceId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        status: 'conflict',
        revision: entityRevision.revision,
        conflictReason: conflict.reason,
        resultHash: hashMutationResult(conflict),
      });
      results.push(conflict);
      continue;
    }

    try {
      const revision = await applySingleMutation(user, mutation);
      const applied: MutationResult = {
        mutationId: mutation.mutationId,
        status: 'applied',
        revision,
      };
      await AppliedSyncMutation.create({
        userId,
        mutationId: mutation.mutationId,
        deviceId: mutation.deviceId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        status: 'applied',
        revision,
        resultHash: hashMutationResult(applied),
      });
      results.push(applied);
    } catch (err) {
      const conflict: MutationResult = {
        mutationId: mutation.mutationId,
        status: 'conflict',
        reason: 'validation',
        serverRevision: entityRevision?.revision ?? null,
        serverValue: null,
      };
      await AppliedSyncMutation.create({
        userId,
        mutationId: mutation.mutationId,
        deviceId: mutation.deviceId,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        status: 'conflict',
        revision: entityRevision?.revision ?? null,
        conflictReason: 'validation',
        resultHash: hashMutationResult(conflict),
      });
      results.push(conflict);
      logger.warn('Mutation validation failed', {
        mutationId: mutation.mutationId,
        error: (err as Error).message,
      });
    }
  }

  const latestChange = await SyncChangeModel.findOne({ userId })
    .sort({ changedAt: -1 })
    .lean();

  return {
    results,
    nextCursor: latestChange?.cursor ?? '',
  };
}

async function applySingleMutation(user: IUser, mutation: SyncMutation): Promise<number> {
  const userId = user._id as Types.ObjectId;

  switch (mutation.entityType) {
    case 'preference': {
      const payload = mutation.payload as PreferenceContract;
      if (payload.theme) user.preferences.theme = payload.theme;
      if (payload.defaultMediaType) user.preferences.defaultMediaType = payload.defaultMediaType;
      if (payload.tvSelectionMode) user.preferences.tvSelectionMode = payload.tvSelectionMode;
      if (payload.animationStyle) user.preferences.animationStyle = payload.animationStyle;
      if (payload.animationSpeed) user.preferences.animationSpeed = payload.animationSpeed;
      if (payload.selectedLibraries) user.preferences.selectedLibraries = payload.selectedLibraries;
      if (payload.savedFilters) {
        user.preferences.savedFilters = {
          ...user.preferences.savedFilters,
          ...payload.savedFilters,
        };
      }
      if (payload.spinHistory) {
        user.preferences.spinHistory = {
          ...user.preferences.spinHistory,
          ...payload.spinHistory,
        } as IUser['preferences']['spinHistory'];
      }
      await user.save();
      await emitSyncChange(userId, 'preference', userId.toString(), 'upsert', toPreferenceContract(user));
      const rev = await SyncEntityRevision.findOne({ userId, entityType: 'preference', entityId: userId.toString() }).lean();
      return rev?.revision ?? 1;
    }
    case 'watched': {
      if (mutation.operation === 'delete') {
        await WatchedItem.deleteOne({ userId, plexId: mutation.entityId });
        await emitSyncChange(userId, 'watched', mutation.entityId, 'delete', null);
      } else {
        const payload = mutation.payload as WatchedContract;
        const item = await WatchedItem.findOneAndUpdate(
          { userId, plexId: mutation.entityId },
          {
            mediaType: payload.mediaType,
            title: payload.title,
            watchedAt: new Date(payload.watchedAt || mutation.clientChangedAt),
            markedManually: true,
            source: 'manual',
          },
          { upsert: true, new: true }
        );
        await emitSyncChange(userId, 'watched', mutation.entityId, 'upsert', toWatchedContract(item));
      }
      const rev = await SyncEntityRevision.findOne({
        userId,
        entityType: 'watched',
        entityId: mutation.entityId,
      }).lean();
      return rev?.revision ?? 1;
    }
    case 'spin_history': {
      if (mutation.operation === 'delete') {
        await SpinHistoryEntry.deleteOne({ _id: mutation.entityId, userId });
        await emitSyncChange(userId, 'spin_history', mutation.entityId, 'delete', null);
      } else {
        const payload = mutation.payload as SpinHistoryContract;
        const entry = await SpinHistoryEntry.create({
          userId,
          plexId: payload.plexId,
          title: payload.title,
          mediaType: payload.mediaType,
          thumbPath: payload.thumbPath,
          year: payload.year,
          libraryIds: payload.libraryIds ?? [],
          filtersSnapshot: payload.filtersSnapshot,
          tvSelectionMode: payload.tvSelectionMode,
          poolSizeAtSpin: payload.poolSizeAtSpin,
          spunAt: new Date(payload.spunAt || mutation.clientChangedAt),
        });
        const entityId = entry._id.toString();
        await emitSyncChange(userId, 'spin_history', entityId, 'upsert', toSpinHistoryContract(entry));
      }
      const rev = await SyncEntityRevision.findOne({
        userId,
        entityType: 'spin_history',
        entityId: mutation.entityId,
      }).lean();
      return rev?.revision ?? 1;
    }
    default:
      throw new Error('Unsupported entity type');
  }
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
