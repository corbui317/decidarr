import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  seedTestUser,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { SyncChange } from '@/lib/models/SyncChange';
import { fakeIntegrations, tautulliResponse, type SentRequest } from '../helpers/fake-integrations';

import { POST as tautulliSyncPost } from '@/app/api/tautulli/sync/route';

/** A Tautulli user as `get_users` returns it. */
function tautulliUser(overrides: { user_id: number; username?: string; friendly_name?: string }) {
  return {
    user_id: overrides.user_id,
    username: overrides.username ?? `user${overrides.user_id}`,
    friendly_name: overrides.friendly_name ?? `User ${overrides.user_id}`,
    thumb: '',
  };
}

/** Tautulli answering its info, users and `history`-by-media-type commands, one page each. */
function fakeTautulli(options: {
  users?: ReturnType<typeof tautulliUser>[];
  history?: { movie?: unknown[]; episode?: unknown[] };
} = {}) {
  const history = options.history ?? {};
  return fakeIntegrations(({ url }) => {
    const cmd = url.searchParams.get('cmd');
    if (cmd === 'get_tautulli_info') return tautulliResponse({ tautulli_version: '2.13.0' });
    if (cmd === 'get_users') return tautulliResponse(options.users ?? []);
    if (cmd === 'get_history') {
      const mediaType = url.searchParams.get('media_type') as 'movie' | 'episode';
      const requestedUserId = url.searchParams.get('user_id');
      const items = (history[mediaType] ?? []) as { user_id: number }[];
      const filtered = requestedUserId === null
        ? items
        : items.filter((item) => String(item.user_id) === requestedUserId);
      return tautulliResponse({ data: filtered });
    }
    return new Response('not found', { status: 404 });
  });
}

const historyQueries = (sent: SentRequest[]) =>
  sent
    .filter((r) => r.url.searchParams.get('cmd') === 'get_history')
    .map((r) => [r.url.searchParams.get('user_id'), r.url.searchParams.get('media_type')]);

function tautulliMovie(overrides: {
  rating_key: string;
  title: string;
  stopped: number;
  user_id: number;
  user?: string;
  year?: number;
}) {
  return {
    reference_id: Number(overrides.rating_key),
    rating_key: overrides.rating_key,
    title: overrides.title,
    year: overrides.year ?? 2020,
    media_type: 'movie' as const,
    watched_status: 1,
    stopped: overrides.stopped,
    user_id: overrides.user_id,
    user: overrides.user ?? `user${overrides.user_id}`,
  };
}

describe('POST /api/tautulli/sync', () => {
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const user = await seedTestUser({ plexUserId: '42', plexUsername: 'alice' });
    const auth = await authenticateTestSession({ user });
    userId = auth.user._id as mongoose.Types.ObjectId;
    const settings = await getOrCreateSettings();
    settings.tautulliEnabled = true;
    settings.tautulliUrl = 'http://192.168.1.20:8181';
    settings.tautulliApiKey = 'tautulli-test-key-abcdefgh';
    await settings.save();
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
    const movies = Array.from({ length: 3 }, (_, i) =>
      tautulliMovie({ rating_key: String(100 + i), title: `Movie ${i}`, stopped: 1700000000 + i, user_id: 42 })
    );

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

    const { sent } = fakeTautulli({ users: [tautulliUser({ user_id: 42 })], history: { movie: movies, episode: episodes } });

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
      tautulliMovie({ rating_key: '100', title: 'Watched Movie', stopped: 1700000000, user_id: 42 }),
      tautulliMovie({ rating_key: '100', title: 'Watched Movie', stopped: 1700000500, user_id: 42 }),
      tautulliMovie({ rating_key: '100', title: 'Watched Movie', stopped: 1700000300, user_id: 42 }),
    ];

    fakeTautulli({ users: [tautulliUser({ user_id: 42 })], history: { movie: duplicateMovies } });

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

  it('imported plays appear in the sync change feed', async () => {
    fakeTautulli({
      users: [tautulliUser({ user_id: 42 })],
      history: { movie: [tautulliMovie({ rating_key: '100', title: 'Watched Movie', stopped: 1700000000, user_id: 42 })] },
    });

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    const changes = await SyncChange.find({ userId, entityType: 'watched', entityId: '100' });
    expect(changes).toHaveLength(1);
    expect(changes[0].operation).toBe('upsert');
  });

  it('re-importing unchanged history does not add another sync change', async () => {
    const movie = tautulliMovie({ rating_key: '100', title: 'Watched Movie', stopped: 1700000000, user_id: 42 });
    fakeTautulli({ users: [tautulliUser({ user_id: 42 })], history: { movie: [movie] } });
    let res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    fakeTautulli({ users: [tautulliUser({ user_id: 42 })], history: { movie: [movie] } });
    res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    const changes = await SyncChange.find({ userId, entityType: 'watched', entityId: '100' });
    expect(changes).toHaveLength(1);
  });

  it('does not import another user whose Tautulli friendly name collides with this user (M8)', async () => {
    // This user's real Tautulli account (id 42) has a friendly name that does not match
    // their Plex username ('alice'). A different Tautulli account (id 99) happens to have a
    // friendly name/username that textually matches this user's own Plex username.
    fakeTautulli({
      users: [
        tautulliUser({ user_id: 99, username: 'alice', friendly_name: 'alice' }),
        tautulliUser({ user_id: 42, username: 'unrelated-name', friendly_name: 'Unrelated Name' }),
      ],
      history: {
        movie: [
          tautulliMovie({ rating_key: 'right-1', title: 'My Movie', stopped: 1700000000, user_id: 42 }),
          tautulliMovie({ rating_key: 'wrong-1', title: 'Someone Elses Movie', stopped: 1700000000, user_id: 99 }),
        ],
      },
    });

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    expect(res.status).toBe(200);

    const watched = await WatchedItem.find({ userId });
    expect(watched.map((w) => w.plexId)).toEqual(['right-1']);
  });

  it('imports nothing, not the Admin history, for a user with no matching Tautulli id (M8)', async () => {
    // This user's Plex id (42) is not a Tautulli user_id at all, has no Plex username of
    // their own, and the Admin's Plex username happens to match a Tautulli account with
    // real history.
    const user = await User.findById(userId);
    user!.plexUsername = undefined;
    await user!.save();

    fakeTautulli({
      users: [tautulliUser({ user_id: 7, username: 'testuser', friendly_name: 'testuser' })],
      history: {
        movie: [tautulliMovie({ rating_key: 'admin-movie', title: 'Admin Movie', stopped: 1700000000, user_id: 7 })],
      },
    });

    const res = await tautulliSyncPost(createJsonRequest('http://localhost/api/tautulli/sync', 'POST') as never);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/could not find/i);
    expect(await WatchedItem.countDocuments({ userId })).toBe(0);
  });
});
