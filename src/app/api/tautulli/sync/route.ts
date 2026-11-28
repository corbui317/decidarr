import mongoose from 'mongoose';
import { tautulliSyncResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:TautulliSync');

export const POST = route({ access: 'user', response: tautulliSyncResponseSchema }, async ({ session, reply }) => {
  const settings = await getOrCreateSettings();

  if (!settings.tautulliEnabled) {
    throw new DomainError('VALIDATION_FAILED', 'Tautulli sync is not enabled');
  }

  if (!settings.tautulliUrl) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Tautulli URL is not configured. Save your Tautulli URL in settings first.'
    );
  }

  const apiKey = settings.getDecryptedTautulliKey();
  if (!apiKey) {
    throw new DomainError('VALIDATION_FAILED', 'Tautulli API key not configured');
  }

  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('INTERNAL');
  }

  const service = new TautulliService(settings.tautulliUrl, apiKey);
  const connectionTest = await service.testConnection();
  if (!connectionTest.success) {
    logger.warn('Cannot reach Tautulli', { tautulliUrl: settings.tautulliUrl, error: connectionTest.error });
    throw new DomainError('INTEGRATION_UNAVAILABLE');
  }

  const plexUsername = user.plexUsername || settings.plexUsername;
  let tautulliUserId: number | undefined = user.tautulliUserId;
  if (!tautulliUserId && plexUsername) {
    const foundId = await service.getUserIdByPlexUsername(plexUsername);
    if (foundId !== null) {
      tautulliUserId = foundId;
      user.tautulliUserId = foundId;
      await user.save();
      logger.info('Found Plex user in Tautulli', { plexUsername, userId: foundId });
    }
  }

  if (!tautulliUserId) {
    throw new DomainError('NOT_FOUND', 'Could not find your Plex user in Tautulli history');
  }

  const decidarrUserId = user._id;
  const movieHistory = await service.getWatchHistoryPaged(tautulliUserId, 'movie');
  const episodeHistory = await service.getWatchHistoryPaged(tautulliUserId, 'episode');

  const moviesWatched = new Map<string, { title: string; watchedAt: Date; userId: number; username: string; year?: number }>();
  for (const movie of movieHistory) {
    const existing = moviesWatched.get(movie.rating_key);
    const movieDate = new Date(movie.stopped * 1000);
    if (!existing || movieDate > existing.watchedAt) {
      moviesWatched.set(movie.rating_key, {
        title: movie.title,
        watchedAt: movieDate,
        userId: movie.user_id,
        username: movie.user,
        year: movie.year,
      });
    }
  }

  const showsWatched = new Map<string, { title: string; watchedAt: Date; userId: number; username: string }>();
  for (const ep of episodeHistory) {
    if (ep.grandparent_rating_key) {
      const existing = showsWatched.get(ep.grandparent_rating_key);
      const epDate = new Date(ep.stopped * 1000);
      if (!existing || epDate > existing.watchedAt) {
        showsWatched.set(ep.grandparent_rating_key, {
          title: ep.grandparent_title || ep.title,
          watchedAt: epDate,
          userId: ep.user_id,
          username: ep.user,
        });
      }
    }
  }

  let synced = 0;
  const bulkOps: mongoose.AnyBulkWriteOperation<typeof WatchedItem>[] = [];

  for (const [ratingKey, data] of Array.from(moviesWatched.entries())) {
    bulkOps.push({
      updateOne: {
        filter: { userId: decidarrUserId, plexId: ratingKey },
        update: {
          $set: {
            mediaType: 'movie',
            title: data.title,
            watchedAt: data.watchedAt,
            source: 'tautulli',
            plexUserId: data.userId,
            plexUsername: data.username,
          },
          $setOnInsert: {
            userId: decidarrUserId,
            plexId: ratingKey,
            markedManually: false,
          },
        },
        upsert: true,
      },
    });
    synced++;
  }

  for (const [ratingKey, data] of Array.from(showsWatched.entries())) {
    bulkOps.push({
      updateOne: {
        filter: { userId: decidarrUserId, plexId: ratingKey },
        update: {
          $set: {
            mediaType: 'show',
            title: data.title,
            watchedAt: data.watchedAt,
            source: 'tautulli',
            plexUserId: data.userId,
            plexUsername: data.username,
          },
          $setOnInsert: {
            userId: decidarrUserId,
            plexId: ratingKey,
            markedManually: false,
          },
        },
        upsert: true,
      },
    });
    synced++;
  }

  if (bulkOps.length > 0) {
    await WatchedItem.bulkWrite(bulkOps, { ordered: false });
  }

  settings.tautulliLastSync = new Date();
  await settings.save();

  logger.info('Tautulli sync completed', { synced, movies: moviesWatched.size, shows: showsWatched.size });

  return reply({
    success: true,
    synced,
    movies: moviesWatched.size,
    shows: showsWatched.size,
    lastSync: settings.tautulliLastSync,
  });
});
