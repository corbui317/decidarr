import mongoose from 'mongoose';
import { getOrCreateSettings } from './models/Settings';
import { User } from './models/User';
import { WatchedItem } from './models/WatchedItem';
import { LibraryCache } from './models/LibraryCache';
import { SpinHistoryEntry } from './models/SpinHistoryEntry';
import {
  extractThumbPathFromUrl,
  containsPlexToken,
} from './plex-image';
import CryptoJS from 'crypto-js';
import {
  getLegacySettingsMasterKey,
  getCurrentSettingsMasterKey,
} from './models/Settings';
import { createLogger } from './logger';

const logger = createLogger('Migration');

const LEGACY_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

let migrationRan = false;

function sanitizeCachedItem(item: Record<string, unknown>): boolean {
  let changed = false;

  if (typeof item.posterUrl === 'string') {
    const thumbPath = extractThumbPathFromUrl(item.posterUrl);
    if (thumbPath && item.thumbPath !== thumbPath) {
      item.thumbPath = thumbPath;
      changed = true;
    }
    if (containsPlexToken(item.posterUrl)) {
      delete item.posterUrl;
      changed = true;
    }
  }

  if (typeof item.art === 'string' && containsPlexToken(item.art)) {
    const artPath = extractThumbPathFromUrl(item.art);
    if (artPath) item.artPath = artPath;
    delete item.art;
    changed = true;
  }

  return changed;
}

async function migrateTokenizedMediaUrls(): Promise<void> {
  const caches = await LibraryCache.find({});
  for (const cache of caches) {
    let changed = false;
    const items = cache.items as unknown as Record<string, unknown>[];
    for (const item of items) {
      if (sanitizeCachedItem(item)) changed = true;
    }
    if (changed) {
      cache.markModified('items');
      await cache.save();
      logger.info('Stripped Plex tokens from library cache', { libraryId: cache.libraryId });
    }
  }

  const historyEntries = await SpinHistoryEntry.find({
    $or: [
      { posterUrl: { $regex: /X-Plex-Token/i } },
      { posterUrl: { $exists: true, $ne: null } },
    ],
  });

  for (const entry of historyEntries) {
    let changed = false;
    if (entry.posterUrl) {
      const thumbPath = extractThumbPathFromUrl(entry.posterUrl);
      if (thumbPath && entry.thumbPath !== thumbPath) {
        entry.thumbPath = thumbPath;
        changed = true;
      }
      if (containsPlexToken(entry.posterUrl) || thumbPath) {
        entry.posterUrl = undefined;
        changed = true;
      }
    }
    if (changed) {
      await entry.save();
    }
  }
}

async function migrateSettingsMasterKey(settings: Awaited<ReturnType<typeof getOrCreateSettings>>): Promise<void> {
  if (!process.env.DECIDARR_SECRET?.trim()) return;

  const legacyKey = getLegacySettingsMasterKey();
  const newKey = getCurrentSettingsMasterKey();
  if (legacyKey === newKey) return;

  const reencrypt = (encrypted: string): string => {
    const plain = CryptoJS.AES.decrypt(encrypted, legacyKey).toString(CryptoJS.enc.Utf8);
    if (!plain) return encrypted;
    return CryptoJS.AES.encrypt(plain, newKey).toString();
  };

  const newJwtSecret = reencrypt(settings.jwtSecret);
  const newEncryptionKey = reencrypt(settings.encryptionKey);

  if (newJwtSecret !== settings.jwtSecret || newEncryptionKey !== settings.encryptionKey) {
    settings.jwtSecret = newJwtSecret;
    settings.encryptionKey = newEncryptionKey;
    await settings.save();
    logger.info('Re-encrypted settings master keys with DECIDARR_SECRET');
  }
}

export async function runMigrations(): Promise<void> {
  if (migrationRan) return;

  const settings = await getOrCreateSettings();

  await migrateSettingsMasterKey(settings);
  await migrateTokenizedMediaUrls();

  if (settings.setupComplete && !settings.adminUserId) {
    const legacyToken = settings.getDecryptedPlexToken();
    if (legacyToken && settings.plexUsername) {
      logger.info('Migrating legacy single-user install to admin User');
      const encryptionKey = settings.getEncryptionKey();
      let admin = await User.findOne({ plexUserId: settings.plexMachineId ? `legacy-${settings.plexUsername}` : settings.plexUsername });

      if (!admin && settings.plexUsername) {
        admin = new User({
          plexUserId: `migrated-${settings.plexUsername}`,
          plexUsername: settings.plexUsername,
          isAdmin: true,
          isApproved: true,
          sessionVersion: 0,
          preferences: {
            theme: settings.uiPreferences?.theme || 'dark',
            defaultMediaType: settings.uiPreferences?.defaultMediaType || 'movie',
            tvSelectionMode: settings.uiPreferences?.tvSelectionMode || 'show',
            animationStyle: settings.uiPreferences?.animationStyle || 'slots',
            animationSpeed: settings.uiPreferences?.animationSpeed || 'normal',
          },
        });
        admin.setEncryptedToken(legacyToken, encryptionKey);
        await admin.save();
      }

      if (admin) {
        settings.adminUserId = admin._id;
        await settings.save();

        await WatchedItem.updateMany(
          { userId: LEGACY_USER_ID },
          { $set: { userId: admin._id } }
        );

        const machineId = settings.plexMachineId || 'unknown';
        const legacyCaches = await mongoose.connection.db
          ?.collection('librarycaches')
          .find({ userId: LEGACY_USER_ID })
          .toArray();

        if (legacyCaches?.length) {
          for (const cache of legacyCaches) {
            await LibraryCache.findOneAndUpdate(
              { plexMachineId: machineId, libraryId: cache.libraryId },
              {
                plexMachineId: machineId,
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
          await mongoose.connection.db
            ?.collection('librarycaches')
            .deleteMany({ userId: LEGACY_USER_ID });
        }

        logger.info('Legacy migration complete', { adminId: admin._id.toString() });
      }
    }
  }

  migrationRan = true;
}

/** @internal Test-only reset for migration state */
export function resetMigrationStateForTests(): void {
  migrationRan = false;
}
