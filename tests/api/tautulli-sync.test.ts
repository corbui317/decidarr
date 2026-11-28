import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { fakeIntegrations, tautulliResponse, type SentRequest } from '../helpers/fake-integrations';

import { POST as tautulliSyncPost } from '@/app/api/tautulli/sync/route';

/** Tautulli answering its info command and serving `history` by media type, one page each. */
function fakeTautulli(history: { movie?: unknown[]; episode?: unknown[] } = {}) {
  return fakeIntegrations(({ url }) => {
    const cmd = url.searchParams.get('cmd');
    if (cmd === 'get_tautulli_info') return tautulliResponse({ tautulli_version: '2.13.0' });
    if (cmd === 'get_history') {
      const mediaType = url.searchParams.get('media_type') as 'movie' | 'episode';
      return tautulliResponse({ data: history[mediaType] ?? [] });
    }
    return new Response('not found', { status: 404 });
  });
}

const historyQueries = (sent: SentRequest[]) =>
  sent
    .filter((r) => r.url.searchParams.get('cmd') === 'get_history')
    .map((r) => [r.url.searchParams.get('user_id'), r.url.searchParams.get('media_type')]);

describe('POST /api/tautulli/sync', () => {
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const auth = await authenticateTestSession();
    userId = auth.user._id as mongoose.Types.ObjectId;
    const settings = await getOrCreateSettings();
    settings.tautulliEnabled = true;
    settings.tautulliUrl = 'http://192.168.1.20:8181';
    settings.tautulliApiKey = 'tautulli-test-key-abcdefgh';
    await settings.save();

    const user = await User.findById(auth.user._id);
    user!.tautulliUserId = 42;
    await user!.save();

  });

  it('returns 400 when Tautulli sync is disabled', async () => {
    const settings = await getOrCreateSettings();
    settings.tautulliEnabled = false;
    await settings.save();

    const { sent } = fakeTautulli();

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not enabled/i);
    expect(sent).toEqual([]);
    expect(await WatchedItem.countDocuments({ userId })).toBe(0);
  });

  it('never includes the internal Tautulli URL when the connection fails (spec #18 story 30)', async () => {
    fakeIntegrations(() => new Response('down', { status: 503 }));

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(text).not.toContain('192.168.1.20');
  });

  it('imports paginated movie and episode history beyond a single page', async () => {
    const movies = Array.from({ length: 3 }, (_, i) => ({
      reference_id: i + 1,
      rating_key: String(100 + i),
      title: `Movie ${i}`,
      year: 2020,
      media_type: 'movie' as const,
      watched_status: 1,
      stopped: 1700000000 + i,
      user_id: 42,
      user: 'testuser',
    }));

    const episodes = [
      {
        reference_id: 10,
        rating_key: '501',
        grandparent_rating_key: '500',
        grandparent_title: 'Show A',
        title: 'Episode 1',
        year: 2021,
        media_type: 'episode' as const,
        watched_status: 1,
        stopped: 1700000100,
        user_id: 42,
        user: 'testuser',
      },
      {
        reference_id: 11,
        rating_key: '502',
        grandparent_rating_key: '500',
        grandparent_title: 'Show A',
        title: 'Episode 2',
        year: 2021,
        media_type: 'episode' as const,
        watched_status: 1,
        stopped: 1700000200,
        user_id: 42,
        user: 'testuser',
      },
    ];

    const { sent } = fakeTautulli({ movie: movies, episode: episodes });

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.movies).toBe(3);
    expect(body.shows).toBe(1);
    expect(body.synced).toBe(4);

    expect(historyQueries(sent)).toEqual([
      ['42', 'movie'],
      ['42', 'episode'],
    ]);
    expect(sent.every((r) => r.url.searchParams.get('apikey') === 'tautulli-test-key-abcdefgh')).toBe(true);

    const watched = await WatchedItem.find({ userId });
    expect(watched).toHaveLength(4);
    expect(watched.find((w) => w.plexId === '500' && w.mediaType === 'show')).toBeTruthy();
  });

  it('deduplicates movie history by rating_key, keeping latest stopped play', async () => {
    const duplicateMovies = [
      {
        reference_id: 1,
        rating_key: '100',
        title: 'Watched Movie',
        year: 2020,
        media_type: 'movie' as const,
        watched_status: 1,
        stopped: 1700000000,
        user_id: 42,
        user: 'testuser',
      },
      {
        reference_id: 2,
        rating_key: '100',
        title: 'Watched Movie',
        year: 2020,
        media_type: 'movie' as const,
        watched_status: 1,
        stopped: 1700000500,
        user_id: 42,
        user: 'testuser',
      },
      {
        reference_id: 3,
        rating_key: '100',
        title: 'Watched Movie',
        year: 2020,
        media_type: 'movie' as const,
        watched_status: 1,
        stopped: 1700000300,
        user_id: 42,
        user: 'testuser',
      },
    ];

    fakeTautulli({ movie: duplicateMovies });

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.movies).toBe(1);
    expect(body.synced).toBe(1);

    const watched = await WatchedItem.find({ userId, mediaType: 'movie' });
    expect(watched).toHaveLength(1);
    expect(watched[0].plexId).toBe('100');
    expect(watched[0].watchedAt.getTime()).toBe(1700000500 * 1000);
  });
});
