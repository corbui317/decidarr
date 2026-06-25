import { vi, describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
} from '../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';

const tautulliMock = {
  testConnection: vi.fn(),
  getUserIdByPlexUsername: vi.fn(),
  getWatchHistoryPaged: vi.fn(),
};

vi.mock('@/lib/services/tautulli', () => ({
  TautulliService: vi.fn(function TautulliServiceMock() {
    return tautulliMock;
  }),
}));

import { POST as tautulliSyncPost } from '@/app/api/tautulli/sync/route';

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

    vi.clearAllMocks();
    tautulliMock.testConnection.mockResolvedValue({ success: true });
    tautulliMock.getUserIdByPlexUsername.mockResolvedValue(42);
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

    tautulliMock.getWatchHistoryPaged
      .mockResolvedValueOnce(movies)
      .mockResolvedValueOnce(episodes);

    const res = await tautulliSyncPost();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.movies).toBe(3);
    expect(body.shows).toBe(1);
    expect(body.synced).toBe(4);

    expect(tautulliMock.getWatchHistoryPaged).toHaveBeenCalledWith(42, 'movie');
    expect(tautulliMock.getWatchHistoryPaged).toHaveBeenCalledWith(42, 'episode');

    const watched = await WatchedItem.find({ userId });
    expect(watched).toHaveLength(4);
    expect(watched.find((w) => w.plexId === '500' && w.mediaType === 'show')).toBeTruthy();
  });
});
