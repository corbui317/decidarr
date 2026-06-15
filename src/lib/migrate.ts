import mongoose from 'mongoose';
import { getOrCreateSettings } from './models/Settings';
import { User } from './models/User';
import { WatchedItem } from './models/WatchedItem';
import { LibraryCache } from './models/LibraryCache';
import { createLogger } from './logger';

const logger = createLogger('Migration');

const LEGACY_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

let migrationRan = false;

export async function runMigrations(): Promise<void> {
  if (migrationRan) return;
  migrationRan = true;

  const settings = await getOrCreateSettings();

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
}
