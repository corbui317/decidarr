import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { TautulliService } from '@/lib/services/tautulli';
import { createLogger } from '@/lib/logger';
import mongoose from 'mongoose';

const logger = createLogger('API:TautulliSync');
const SINGLE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

export async function POST() {
  try {
    const { settings } = await requireAuth();

    if (!settings.tautulliEnabled || !settings.tautulliUrl) {
      return NextResponse.json(
        { error: 'Tautulli is not configured' },
        { status: 400 }
      );
    }

    const apiKey = settings.getDecryptedTautulliKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Tautulli API key not configured' },
        { status: 400 }
      );
    }

    await connectDB();

    const service = new TautulliService(settings.tautulliUrl, apiKey);
    const plexUsername = settings.plexUsername;

    let userId: number | undefined;
    if (plexUsername) {
      const foundId = await service.getUserIdByPlexUsername(plexUsername);
      if (foundId !== null) {
        userId = foundId;
        logger.info('Found Plex user in Tautulli', { plexUsername, userId });
      }
    }

    const movieHistory = await service.getWatchHistory(userId, 'movie', 1000);
    const showHistory = await service.getWatchHistory(userId, undefined, 1000);

    const episodeHistory = showHistory.filter(h => h.media_type === 'episode');

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

    for (const item of movieHistory) {
      bulkOps.push({
        updateOne: {
          filter: { userId: SINGLE_USER_ID, plexId: item.rating_key },
          update: {
            $set: {
              mediaType: 'movie',
              title: item.title,
              watchedAt: new Date(item.stopped * 1000),
              source: 'tautulli',
              plexUserId: item.user_id,
              plexUsername: item.user,
            },
            $setOnInsert: {
              userId: SINGLE_USER_ID,
              plexId: item.rating_key,
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
          filter: { userId: SINGLE_USER_ID, plexId: ratingKey },
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
              userId: SINGLE_USER_ID,
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

    logger.info('Tautulli sync completed', { synced, movies: movieHistory.length, shows: showsWatched.size });

    return NextResponse.json({
      success: true,
      synced,
      movies: movieHistory.length,
      shows: showsWatched.size,
      lastSync: settings.tautulliLastSync,
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    if (msg === 'App not configured' || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    logger.error('Tautulli sync error', { error: msg });
    return NextResponse.json(
      { error: 'Failed to sync with Tautulli' },
      { status: 500 }
    );
  }
}
