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
