import { describe, it, expect } from 'vitest';
import { createApiClient } from '@decidarr/api-contracts';
import type { Transport } from '@decidarr/api-contracts';

/**
 * Live bug 1: the mobile client expected `/api/selection/random` to return
 * `{ item, poolSize }`, but the server has always returned
 * `{ selection, playLinks, stats }`. Reproduces the real server response shape
 * through a fake transport (no network, no React Native) and asserts the
 * mobile-facing `selection.random` call exposes exactly that shape.
 */
describe('mobile spin result (live bug 1)', () => {
  it('returns the real server response shape, not the assumed { item, poolSize } shape', async () => {
    const realServerResponse = {
      selection: { plexId: 'abc123', title: 'Alien', type: 'movie', year: 1979 },
      playLinks: { web: 'https://plex/web', app: 'plex://app', ios: 'plex://ios', android: 'plex://android', machineId: null },
      stats: { totalMatches: 12 },
    };

    const fakeTransport: Transport = {
      request: async () => realServerResponse as never,
    };

    const client = createApiClient(fakeTransport);
    const result = await client.selection.random({
      libraryIds: ['1'],
      mediaType: 'movie',
      filters: {
        genres: [],
        yearRange: null,
        contentRatings: [],
        studios: [],
        ratingRange: null,
        ratingFilter: null,
        unwatchedOnly: false,
        collections: [],
      },
    });

    expect(result.selection.title).toBe('Alien');
    expect(result.selection.plexId).toBe('abc123');
    expect(result.stats.totalMatches).toBe(12);
    expect((result as unknown as { item?: unknown }).item).toBeUndefined();
    expect((result as unknown as { poolSize?: unknown }).poolSize).toBeUndefined();
  });
});
