import type { Types } from 'mongoose';
import {
  watchedCreateBodySchema,
  watchedPlexIdParamsSchema,
  type WatchedContract,
} from '@decidarr/api-contracts';
import { WatchedItem, type IWatchedItem } from '@/lib/models/WatchedItem';
import { DomainError, parseContract } from '@/lib/request/errors';
import { emitSyncChange } from './sync-changes';
import type { UserDataActor } from '.';

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

function parsePlexId(plexId: unknown): string {
  return parseContract(watchedPlexIdParamsSchema, { plexId }).plexId;
}

/** Changing watched state by hand is the Admin's alone; Friends get theirs from Tautulli. */
function assertMayChangeWatchedManually(actor: UserDataActor): void {
  if (!actor.isAdmin) {
    throw new DomainError('FORBIDDEN', 'Only the Admin can change watched state manually');
  }
}

/** Marks a title watched by hand. */
export async function markWatched(
  actor: UserDataActor,
  plexId: unknown,
  input: unknown,
  watchedAt: Date = new Date()
): Promise<{ item: IWatchedItem; revision: number }> {
  const id = parsePlexId(plexId);
  const { mediaType, title } = parseContract(watchedCreateBodySchema, input);
  assertMayChangeWatchedManually(actor);

  const item = (await WatchedItem.findOneAndUpdate(
    { userId: actor.userId, plexId: id },
    { mediaType, title, watchedAt, markedManually: true, source: 'manual' },
    { upsert: true, new: true }
  ))!;
  const revision = await emitSyncChange(actor.userId, 'watched', id, 'upsert', toWatchedContract(item));
  return { item, revision };
}

/** Marks a title unwatched by hand. */
export async function unmarkWatched(actor: UserDataActor, plexId: unknown): Promise<{ revision: number }> {
  const id = parsePlexId(plexId);
  assertMayChangeWatchedManually(actor);

  await WatchedItem.deleteOne({ userId: actor.userId, plexId: id });
  return { revision: await emitSyncChange(actor.userId, 'watched', id, 'delete', null) };
}

export interface TautulliImportItem {
  plexId: string;
  mediaType: 'movie' | 'show';
  title: string;
  watchedAt: Date;
  plexUserId: number;
  plexUsername: string;
}

/**
 * Imports one play from Tautulli. Only writes, and only emits a sync change, when the
 * stored play actually differs, so re-importing an unchanged history does not flood the
 * sync change feed.
 */
export async function importWatchedFromTautulli(
  actor: UserDataActor,
  item: TautulliImportItem
): Promise<{ changed: boolean }> {
  const id = parsePlexId(item.plexId);
  const { mediaType, title } = parseContract(watchedCreateBodySchema, {
    mediaType: item.mediaType,
    title: item.title,
  });

  const existing = await WatchedItem.findOne({ userId: actor.userId, plexId: id });
  if (
    existing &&
    existing.source === 'tautulli' &&
    existing.mediaType === mediaType &&
    existing.title === title &&
    existing.watchedAt.getTime() === item.watchedAt.getTime() &&
    existing.plexUserId === item.plexUserId &&
    existing.plexUsername === item.plexUsername
  ) {
    return { changed: false };
  }

  const updated = (await WatchedItem.findOneAndUpdate(
    { userId: actor.userId, plexId: id },
    {
      $set: {
        mediaType,
        title,
        watchedAt: item.watchedAt,
        source: 'tautulli',
        plexUserId: item.plexUserId,
        plexUsername: item.plexUsername,
      },
      $setOnInsert: { userId: actor.userId, plexId: id, markedManually: false },
    },
    { upsert: true, new: true }
  ))!;
  await emitSyncChange(actor.userId, 'watched', id, 'upsert', toWatchedContract(updated));
  return { changed: true };
}
