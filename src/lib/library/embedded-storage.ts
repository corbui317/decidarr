import mongoose from 'mongoose';
import { LibraryCache } from '@/lib/models/LibraryCache';
import { LibraryVisibility } from '@/lib/models/LibraryVisibility';
import type { LibraryStorage, StoredLibrary, VisibleSet } from './storage';

/**
 * The embedded adapter: each library's shared items live as one array in its `librarycaches`
 * document, and each user's visible keys as one array in a `libraryvisibilities` document.
 */
export const embeddedStorage: LibraryStorage = {
  async readLibraries(server, libraryIds) {
    return LibraryCache.find({ plexMachineId: server, libraryId: { $in: libraryIds } }).lean<StoredLibrary[]>();
  },

  async writeLibrary(server, library) {
    await LibraryCache.updateOne(
      { plexMachineId: server, libraryId: library.libraryId },
      { $set: { plexMachineId: server, ...library } },
      { upsert: true }
    );
  },

  async readVisibility(server, userId, libraryIds) {
    return LibraryVisibility.find({ userId, plexMachineId: server, libraryId: { $in: libraryIds } }).lean<VisibleSet[]>();
  },

  async writeVisibility(server, userId, visible) {
    await LibraryVisibility.updateOne(
      { userId, plexMachineId: server, libraryId: visible.libraryId },
      { $set: { userId, plexMachineId: server, ...visible } },
      { upsert: true }
    );
  },

  async keysVisibleToOthers(server, libraryId, userId) {
    const others = await LibraryVisibility.find({ plexMachineId: server, libraryId, userId: { $ne: userId } })
      .select('plexIds')
      .lean();
    return new Set(others.flatMap((visible) => visible.plexIds));
  },
};

/** Upgrade step: applies `rewrite` to every stored item and saves each library where it changed one. */
export async function rewriteStoredItems(
  rewrite: (item: Record<string, unknown>) => boolean
): Promise<string[]> {
  const rewritten: string[] = [];
  for (const cache of await LibraryCache.find({})) {
    let changed = false;
    for (const item of cache.items as unknown as Record<string, unknown>[]) {
      if (rewrite(item)) changed = true;
    }
    if (changed) {
      cache.markModified('items');
      await cache.save();
      rewritten.push(cache.libraryId);
    }
  }
  return rewritten;
}

/**
 * Upgrade step: re-keys libraries cached before multi-user support (stored per user id) to
 * the server. They become shared metadata only; nobody sees an item until their own sync.
 */
export async function adoptLegacyLibraries(server: string, legacyUserId: mongoose.Types.ObjectId): Promise<void> {
  const collection = mongoose.connection.db?.collection('librarycaches');
  const legacyCaches = await collection?.find({ userId: legacyUserId }).toArray();
  if (!legacyCaches?.length) return;

  for (const cache of legacyCaches) {
    await LibraryCache.findOneAndUpdate(
      { plexMachineId: server, libraryId: cache.libraryId },
      {
        plexMachineId: server,
        libraryId: cache.libraryId,
        libraryName: cache.libraryName,
        mediaType: cache.mediaType,
        items: cache.items,
        lastSyncedAt: cache.lastSyncedAt,
        expiresAt: cache.expiresAt,
      },
      { upsert: true }
    );
  }
  await collection?.deleteMany({ userId: legacyUserId });
}
