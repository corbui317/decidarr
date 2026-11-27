import mongoose from 'mongoose';
import {
  getOrCreateSettings,
  Settings,
  SETTINGS_ID,
  SETTINGS_SECRET_FIELDS,
  type ISettings,
} from './models/Settings';
import { User, USER_TOKEN_FIELDS, userTokenLocation, type IUser } from './models/User';
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
import { normalizeSpinHistoryPreferences } from './user-data/spin-history';
import { createLogger } from './logger';
import { assertTestOnly } from './test-only';
import { IntegrationError } from './integrations/client';
import { fetchPlexServers } from './services/plex-oauth';
import { PlexService } from './services/plex';

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

/** Settings secrets the migration reads: the live ones plus the legacy Plex token it removes. */
const STORED_SETTINGS_SECRETS = [...SETTINGS_SECRET_FIELDS, 'plexToken'] as const;

const SETTINGS_SECRET_LABELS: Record<(typeof STORED_SETTINGS_SECRETS)[number], string> = {
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
  for (const field of STORED_SETTINGS_SECRETS) {
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

  // Only the legacy account token can predate v3; the per-server and Admin tokens are always v3.
  const users = await User.find({ plexToken: { $exists: true, $nin: [null, ''] } }, { plexToken: 1 });
  for (const user of users) {
    const next = user.plexToken && upgrade(user.plexToken, userTokenLocation(user, 'plexToken'));
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

  for (const field of STORED_SETTINGS_SECRETS) {
    const stored = settings[field];
    if (stored && unreadable(stored, { recordType: 'settings', recordId: SETTINGS_ID, field })) {
      labels.push(SETTINGS_SECRET_LABELS[field]);
    }
  }

  const users = await User.find(
    { $or: USER_TOKEN_FIELDS.map((field) => ({ [field]: { $exists: true, $nin: [null, ''] } })) },
    { ...Object.fromEntries(USER_TOKEN_FIELDS.map((field) => [field, 1])), plexUsername: 1, plexUserId: 1 }
  ).sort({ plexUsername: 1 });
  for (const user of users) {
    const anyUnreadable = USER_TOKEN_FIELDS.some((field) => {
      const stored = user[field];
      return !!stored && unreadable(stored, userTokenLocation(user, field));
    });
    if (anyUnreadable) {
      labels.push(`Plex sign-in for ${user.plexUsername || user.plexUserId}`);
    }
  }

  return labels;
}

/** The pre-ADR 0002 settings-level Plex token, or null when there is none or it cannot be read. */
function readLegacySettingsPlexToken(settings: ISettings): string | null {
  if (!settings.plexToken) return null;
  try {
    return decryptSecret(settings.plexToken, { recordType: 'settings', recordId: SETTINGS_ID, field: 'plexToken' });
  } catch {
    return null;
  }
}

/** Reads a user's legacy account token; null when it cannot be decrypted with the current keys. */
function readLegacyAccountToken(user: IUser): string | null {
  try {
    return decryptSecret(user.plexToken!, userTokenLocation(user, 'plexToken'));
  } catch {
    return null;
  }
}

/** Installs set up by hand before OAuth may not know their server's identity; the exchange needs it. */
async function ensurePlexMachineId(settings: ISettings, users: IUser[]): Promise<void> {
  if (settings.plexMachineId || !settings.plexServerUrl) return;
  const adminToken = users.filter((user) => user.isAdmin).map(readLegacyAccountToken).find(Boolean);
  if (!adminToken) return;
  // A refusal here only means the identity stays unknown until a later start.
  const machineId = await new PlexService(adminToken, settings.plexServerUrl).fetchMachineIdFromServer().catch(() => null);
  if (!machineId) return;
  await Settings.updateOne({ _id: SETTINGS_ID, plexMachineId: { $exists: false } }, { $set: { plexMachineId: machineId } });
  settings.plexMachineId = (await Settings.findById(SETTINGS_ID, { plexMachineId: 1 }).lean())?.plexMachineId;
}

/**
 * Exchanges every stored plex.tv account token (written before ADR 0002) for that user's
 * access token to this install's server, keeps the Admin's account token, and drops a
 * Friend's. A user whose token cannot be read, or whose exchange gets anything from
 * plex.tv but a refusal of that token (401), keeps exactly what is stored and is retried
 * at the next start; meanwhile they are
 * asked to sign in again. Their other data is never touched. Each user's write lands only
 * if their stored token is still the one that was read, so a sign-in in between wins and
 * a second or interrupted run picks up exactly the users not yet done.
 */
async function exchangeAccountTokens(settings: ISettings): Promise<void> {
  const users = await User.find({ plexToken: { $exists: true, $nin: [null, ''] } });
  if (users.length === 0) return;

  await ensurePlexMachineId(settings, users);
  if (!settings.plexMachineId) {
    logger.warn("Plex server identity unknown; stored Plex tokens are kept and exchanged at a later start");
    return;
  }

  const signInAgain: string[] = [];
  let exchanged = 0;
  for (const [index, user] of users.entries()) {
    const label = user.plexUsername || user.plexUserId;
    const stored = user.plexToken!;
    const accountToken = readLegacyAccountToken(user);
    if (!accountToken) {
      signInAgain.push(label);
      continue;
    }

    let serverToken: string | null;
    try {
      const servers = await fetchPlexServers(accountToken);
      serverToken = servers.find((server) => server.clientIdentifier === settings.plexMachineId)?.accessToken ?? null;
    } catch (err) {
      if (!(err instanceof IntegrationError && err.status === 401)) {
        // Anything short of plex.tv refusing the token (unreachable, rate-limited, timed out, unreadable)
        // keeps every remaining token for the next start rather than wait on each.
        signInAgain.push(...users.slice(index).map((u) => u.plexUsername || u.plexUserId));
        break;
      }
      // plex.tv refused the account token itself.
      serverToken = null;
    }

    const set: Record<string, string> = {};
    if (serverToken) {
      set.plexServerToken = encryptSecret(serverToken, userTokenLocation(user, 'plexServerToken'));
      set.plexServerMachineId = settings.plexMachineId;
    }
    if (user.isAdmin) set.plexAccountToken = encryptSecret(accountToken, userTokenLocation(user, 'plexAccountToken'));
    const result = await User.updateOne(
      { _id: user._id, plexToken: stored },
      { $unset: { plexToken: 1 }, ...(Object.keys(set).length > 0 ? { $set: set } : {}) }
    );
    if (result.modifiedCount === 1 && serverToken) exchanged += 1;
    if (result.modifiedCount === 1 && !serverToken) signInAgain.push(label);
  }

  if (exchanged > 0) {
    logger.info('Exchanged stored Plex account tokens for server access tokens', { count: exchanged });
  }
  if (signInAgain.length > 0) {
    logger.warn('Some users have no Plex server access token and must sign in again', { users: signInAgain });
  }
}

/**
 * Removes the pre-ADR 0002 settings-level Plex token once an Admin user exists, since
 * each user's own server token replaces it. An unreadable one is kept and reported.
 */
async function removeLegacySettingsPlexToken(settings: ISettings): Promise<void> {
  if (!settings.plexToken || !settings.adminUserId) return;
  if (!readLegacySettingsPlexToken(settings)) return;
  if (!(await User.exists({ _id: settings.adminUserId }))) return;
  const result = await Settings.updateOne(
    { _id: SETTINGS_ID, plexToken: settings.plexToken },
    { $unset: { plexToken: 1 } }
  );
  if (result.modifiedCount === 1) {
    settings.plexToken = undefined;
    logger.info('Removed the legacy settings-level Plex token');
  }
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
    const legacyToken = readLegacySettingsPlexToken(settings);
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
            // Single-user installs kept these on the settings document; the stored copy there is left as is.
            spinHistory: normalizeSpinHistoryPreferences(settings.get('spinHistoryPreferences')),
          },
        });
        // Stored as a legacy account token so the exchange below treats it like any other.
        admin.plexToken = encryptSecret(legacyToken, userTokenLocation(admin, 'plexToken'));
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

  await exchangeAccountTokens(settings);
  await removeLegacySettingsPlexToken(settings);

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
