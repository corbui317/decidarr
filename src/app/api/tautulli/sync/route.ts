import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { TautulliService } from '@/lib/services/tautulli';
import { importWatchedFromTautulli } from '@/lib/user-data';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:TautulliSync');

export const POST = route({ access: 'user' }, async ({ session }) => {
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

  const plexAccountId = Number(user.plexUserId);
  const tautulliUserId = Number.isInteger(plexAccountId)
    ? await service.getUserIdByPlexId(plexAccountId)
    : null;

  if (tautulliUserId === null) {
    throw new DomainError('NOT_FOUND', 'Could not find your Plex user in Tautulli history');
  }

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

  const actor = { userId: user._id, isAdmin: user.isAdmin };
  let synced = 0;

  for (const [ratingKey, data] of Array.from(moviesWatched.entries())) {
    await importWatchedFromTautulli(actor, {
      plexId: ratingKey,
      mediaType: 'movie',
      title: data.title,
      watchedAt: data.watchedAt,
      plexUserId: data.userId,
      plexUsername: data.username,
    });
    synced++;
  }

  for (const [ratingKey, data] of Array.from(showsWatched.entries())) {
    await importWatchedFromTautulli(actor, {
      plexId: ratingKey,
      mediaType: 'show',
      title: data.title,
      watchedAt: data.watchedAt,
      plexUserId: data.userId,
      plexUsername: data.username,
    });
    synced++;
  }

  settings.tautulliLastSync = new Date();
  await settings.save();

  logger.info('Tautulli sync completed', { synced, movies: moviesWatched.size, shows: showsWatched.size });

  return NextResponse.json({
    success: true,
    synced,
    movies: moviesWatched.size,
    shows: showsWatched.size,
    lastSync: settings.tautulliLastSync,
  });
});
