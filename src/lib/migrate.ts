import mongoose from 'mongoose';
import {
  getOrCreateSettings,
  SETTINGS_ID,
  SETTINGS_SECRET_FIELDS,
  type ISettings,
} from './models/Settings';
import { User, userTokenLocation } from './models/User';
import { WatchedItem } from './models/WatchedItem';
import { LibraryCache } from './models/LibraryCache';
import { SpinHistoryEntry } from './models/SpinHistoryEntry';
import { MobileAuthCode, authCodeTokenLocation } from './models/MobileAuthCode';
import {
  extractThumbPathFromUrl,
  containsPlexToken,
} from './plex-image';
import {
  decryptLegacy,
  decryptSecret,
  encryptSecret,
  isCurrentCiphertext,
  isLegacyCiphertext,
  unwrapLegacyDataKey,
  type SecretLocation,
} from './secrets';
import { createLogger } from './logger';
import { assertTestOnly } from './test-only';

const logger = createLogger('Migration');

const LEGACY_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

/** The one migration run of this process, shared by concurrent callers (ADR 0001). */
let migration: Promise<void> | null = null;

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

const SETTINGS_SECRET_LABELS: Record<(typeof SETTINGS_SECRET_FIELDS)[number], string> = {
  plexToken: 'Plex token (server settings)',
  tmdbApiKey: 'TMDB API key',
  tautulliApiKey: 'Tautulli API key',
  overseerrApiKey: 'Overseerr API key',
};

/**
 * Re-encrypts every readable value written before v3 (v2 or CryptoJS, under the legacy
 * data key) and encrypts plaintext Plex tokens left on pending mobile sign-ins.
 * A value that cannot be read is left exactly as it is: nothing is ever cleared here.
 * Each write only lands if the stored value is still the one that was read.
 */
async function upgradeStoredSecrets(settings: ISettings): Promise<void> {
  let legacyDataKey: string | null | undefined;
  const readLegacyDataKey = (): string | null => {
    if (legacyDataKey === undefined) {
      try {
        legacyDataKey = settings.encryptionKey ? unwrapLegacyDataKey(settings.encryptionKey) : null;
      } catch {
        legacyDataKey = null;
      }
    }
    return legacyDataKey;
  };

  const upgrade = (stored: string, location: SecretLocation): string | null => {
    if (isCurrentCiphertext(stored)) return null;
    if (!isLegacyCiphertext(stored)) {
      // Only pending mobile sign-ins ever stored a Plex token in plaintext.
      return location.recordType === 'mobileAuthCode' ? encryptSecret(stored, location) : null;
    }
    const dataKey = readLegacyDataKey();
    if (!dataKey) return null;
    try {
      return encryptSecret(decryptLegacy(stored, dataKey), location);
    } catch {
      return null;
    }
  };

  let upgraded = 0;

  const settingsUpdate: Record<string, string> = {};
  const settingsFilter: Record<string, string> = { _id: SETTINGS_ID };
  for (const field of SETTINGS_SECRET_FIELDS) {
    const stored = settings[field];
    const next = stored && upgrade(stored, { recordType: 'settings', recordId: SETTINGS_ID, field });
    if (stored && next) {
      settingsFilter[field] = stored;
      settingsUpdate[field] = next;
    }
  }
  if (Object.keys(settingsUpdate).length > 0) {
    const result = await mongoose.connection
      .collection('settings')
      .updateOne(settingsFilter as never, { $set: settingsUpdate });
    if (result.modifiedCount === 1) {
      Object.assign(settings, settingsUpdate);
      upgraded += Object.keys(settingsUpdate).length;
    }
  }

  const users = await User.find({ plexToken: { $exists: true, $nin: [null, ''] } }, { plexToken: 1 });
  for (const user of users) {
    const next = upgrade(user.plexToken, userTokenLocation(user));
    if (!next) continue;
    const result = await User.updateOne(
      { _id: user._id, plexToken: user.plexToken },
      { $set: { plexToken: next } }
    );
    upgraded += result.modifiedCount;
  }

  const codes = await MobileAuthCode.find(
    { plexAuthToken: { $exists: true, $nin: [null, ''] } },
    { plexAuthToken: 1 }
  );
  for (const code of codes) {
    const next = code.plexAuthToken && upgrade(code.plexAuthToken, authCodeTokenLocation(code));
    if (!next) continue;
    const result = await MobileAuthCode.updateOne(
      { _id: code._id, plexAuthToken: code.plexAuthToken },
      { $set: { plexAuthToken: next } }
    );
    upgraded += result.modifiedCount;
  }

  if (upgraded > 0) {
    logger.info('Upgraded stored secrets to the v3 format', { count: upgraded });
  }
}

/**
 * Labels of the stored credentials that cannot be decrypted with the current keys.
 * They are kept unchanged; the Admin re-enters them, or restarts with the previous
 * DECIDARR_SECRET and MONGODB_URI to get them back.
 */
export async function findCredentialsNeedingReentry(): Promise<string[]> {
  const settings = await getOrCreateSettings();
  const labels: string[] = [];
  const unreadable = (stored: string, location: SecretLocation): boolean => {
    try {
      decryptSecret(stored, location);
      return false;
    } catch {
      return true;
    }
  };

  for (const field of SETTINGS_SECRET_FIELDS) {
    const stored = settings[field];
    if (stored && unreadable(stored, { recordType: 'settings', recordId: SETTINGS_ID, field })) {
      labels.push(SETTINGS_SECRET_LABELS[field]);
    }
  }

  const users = await User.find(
    { plexToken: { $exists: true, $nin: [null, ''] } },
    { plexToken: 1, plexUsername: 1, plexUserId: 1 }
  ).sort({ plexUsername: 1 });
  for (const user of users) {
    if (unreadable(user.plexToken, userTokenLocation(user))) {
      labels.push(`Plex sign-in for ${user.plexUsername || user.plexUserId}`);
    }
  }

  return labels;
}

/** Runs this process's migrations once; concurrent callers share the same run, and a failed run is retried. */
export function runMigrations(): Promise<void> {
  migration ??= migrate().catch((err) => {
    migration = null;
    throw err;
  });
  return migration;
}

async function migrate(): Promise<void> {
  const settings = await getOrCreateSettings();

  await upgradeStoredSecrets(settings);
  await migrateTokenizedMediaUrls();

  if (settings.setupComplete && !settings.adminUserId) {
    const legacyToken = settings.getDecryptedPlexToken();
    if (legacyToken && settings.plexUsername) {
      logger.info('Migrating legacy single-user install to admin User');
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
        admin.setEncryptedToken(legacyToken);
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

  const needReentry = await findCredentialsNeedingReentry();
  if (needReentry.length > 0) {
    logger.warn(
      'Some stored credentials cannot be decrypted with the current DECIDARR_SECRET and MONGODB_URI. ' +
        'They are kept unchanged: restart with the previous values to recover them, or re-enter them.',
      { credentials: needReentry }
    );
  }
}

/** @internal Test-only reset for migration state */
export function resetMigrationStateForTests(): void {
  assertTestOnly('resetMigrationStateForTests');
  migration = null;
}
