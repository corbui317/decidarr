import mongoose from 'mongoose';
import { getOrCreateSettings, recoverFromSecretChange } from './models/Settings';
import { User } from './models/User';
import { WatchedItem } from './models/WatchedItem';
import { LibraryCache } from './models/LibraryCache';
import { SpinHistoryEntry } from './models/SpinHistoryEntry';
import {
  extractThumbPathFromUrl,
  containsPlexToken,
} from './plex-image';
import {
  getLegacyMasterKey,
  getMasterKey,
  CURRENT_MIGRATION_VERSION,
  encryptWithAesGcm,
  decryptVersioned,
  encryptUserData,
  decryptUserData,
} from './models/Settings';
import { createLogger } from './logger';
import { assertTestOnly } from './test-only';

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
  // Check if migration is needed
  if (settings.secretsMigrationVersion === CURRENT_MIGRATION_VERSION) {
    return;
  }

  // If no DECIDARR_SECRET in non-production, skip migration
  if (!process.env.DECIDARR_SECRET?.trim() && process.env.NODE_ENV !== 'production') {
    return;
  }

  const legacyKey = getLegacyMasterKey();
  const newKey = getMasterKey();

  // If keys are the same, we're not using DECIDARR_SECRET, skip migration
  if (legacyKey === newKey) {
    settings.secretsMigrationVersion = CURRENT_MIGRATION_VERSION;
    await settings.save();
    return;
  }

  logger.info('Starting secret migration to AES-256-GCM');

  const reencrypt = (encrypted: string, fieldName: string): string => {
    // If already in v2 format, no migration needed
    if (encrypted.startsWith('v2:')) {
      return encrypted;
    }

    try {
      // Decrypt with legacy key
      const plain = decryptVersioned(encrypted, legacyKey);
      if (!plain) {
        logger.warn(`Empty decryption result for ${fieldName}, skipping re-encryption`);
        return encrypted;
      }

      // Re-encrypt with new key using AES-256-GCM
      return encryptWithAesGcm(plain, newKey);
    } catch (err) {
      logger.error(`Failed to migrate ${fieldName}`, { error: String(err) });
      throw new Error(`Secret migration failed for ${fieldName}: ${String(err)}`);
    }
  };

  try {
    const newJwtSecret = reencrypt(settings.jwtSecret, 'jwtSecret');
    const newEncryptionKey = reencrypt(settings.encryptionKey, 'encryptionKey');

    // Only save if values actually changed
    if (newJwtSecret !== settings.jwtSecret || newEncryptionKey !== settings.encryptionKey) {
      settings.jwtSecret = newJwtSecret;
      settings.encryptionKey = newEncryptionKey;
      settings.secretsMigrationVersion = CURRENT_MIGRATION_VERSION;
      await settings.save();
      logger.info('Successfully migrated secrets to AES-256-GCM');
    } else {
      // Values didn't change, but mark migration as complete
      settings.secretsMigrationVersion = CURRENT_MIGRATION_VERSION;
      await settings.save();
      logger.info('Secrets already in current format, marked migration complete');
    }
  } catch (err) {
    // Secret migration failure likely means DECIDARR_SECRET changed
    logger.error('Secret migration failed - DECIDARR_SECRET may have changed', {
      error: String(err),
    });

    // Trigger recovery: generate fresh keys, clear encrypted fields
    await recoverFromSecretChange();

    logger.info('Recovery complete - admin can now re-login to re-enter credentials');
  }
}

/**
 * After the one-time migration, the stored jwtSecret and encryptionKey are
 * wrapped with the key derived from DECIDARR_SECRET. If they no longer decrypt,
 * the operator changed DECIDARR_SECRET: start over with fresh keys rather than
 * failing every request.
 */
async function recoverIfSecretChanged(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>
): Promise<Awaited<ReturnType<typeof getOrCreateSettings>>> {
  if (settings.secretsMigrationVersion !== CURRENT_MIGRATION_VERSION) {
    return settings;
  }

  try {
    settings.getJwtSecret();
    settings.getEncryptionKey();
    return settings;
  } catch {
    logger.error(
      'Stored secrets cannot be decrypted with the current DECIDARR_SECRET (it changed). ' +
        'Generating fresh keys and clearing stored credentials: sign in again with Plex as the ' +
        'server owner and re-enter integration credentials in Settings.'
    );
    return recoverFromSecretChange();
  }
}

async function migrateIntegrationCredentials(settings: Awaited<ReturnType<typeof getOrCreateSettings>>): Promise<void> {
  // Get encryption key - must be decrypted at this point
  let encryptionKey: string;
  try {
    encryptionKey = settings.getEncryptionKey();
  } catch (err) {
    logger.warn('Skipping integration credentials migration - encryption key unavailable');
    return;
  }

  let changed = false;

  // Helper to re-encrypt if not already v2:
  const reencryptUserData = (encrypted: string | undefined, fieldName: string): string | undefined => {
    if (!encrypted) return encrypted;
    if (encrypted.startsWith('v2:')) return encrypted;

    try {
      // Legacy CryptoJS ciphertext, validated and decrypted with the encryption key
      const plain = decryptUserData(encrypted, encryptionKey);

      // Re-encrypt with AES-256-GCM
      return encryptUserData(plain, encryptionKey);
    } catch (err) {
      logger.error(`Failed to migrate ${fieldName}`, { error: String(err) });
      return encrypted;
    }
  };

  // Migrate integration credentials
  if (settings.plexToken) {
    const migrated = reencryptUserData(settings.plexToken, 'plexToken');
    if (migrated !== settings.plexToken) {
      settings.plexToken = migrated;
      changed = true;
    }
  }

  if (settings.tmdbApiKey) {
    const migrated = reencryptUserData(settings.tmdbApiKey, 'tmdbApiKey');
    if (migrated !== settings.tmdbApiKey) {
      settings.tmdbApiKey = migrated;
      changed = true;
    }
  }

  if (settings.tautulliApiKey) {
    const migrated = reencryptUserData(settings.tautulliApiKey, 'tautulliApiKey');
    if (migrated !== settings.tautulliApiKey) {
      settings.tautulliApiKey = migrated;
      changed = true;
    }
  }

  if (settings.overseerrApiKey) {
    const migrated = reencryptUserData(settings.overseerrApiKey, 'overseerrApiKey');
    if (migrated !== settings.overseerrApiKey) {
      settings.overseerrApiKey = migrated;
      changed = true;
    }
  }

  if (changed) {
    await settings.save();
    logger.info('Successfully migrated integration credentials to AES-256-GCM');
  }

  // Migrate all user plexTokens
  const users = await User.find({ plexToken: { $exists: true, $ne: null } });
  let userCount = 0;

  for (const user of users) {
    if (user.plexToken && !user.plexToken.startsWith('v2:')) {
      const migrated = reencryptUserData(user.plexToken, `user ${user._id} plexToken`);
      if (migrated && migrated !== user.plexToken) {
        user.plexToken = migrated;
        await user.save();
        userCount++;
      }
    }
  }

  if (userCount > 0) {
    logger.info(`Successfully migrated ${userCount} user plexTokens to AES-256-GCM`);
  }
}

export async function runMigrations(): Promise<void> {
  if (migrationRan) return;

  await migrateSettingsMasterKey(await getOrCreateSettings());
  // Re-read: the master-key migration or its recovery may have replaced the document.
  const settings = await recoverIfSecretChanged(await getOrCreateSettings());

  await migrateIntegrationCredentials(settings);
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
  assertTestOnly('resetMigrationStateForTests');
  migrationRan = false;
}
