import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth/session', () => ({
  getAccessToken: vi.fn().mockResolvedValue('current-access-token'),
  getAccessTokenExpiresAt: vi.fn().mockResolvedValue(Date.now() + 10 * 60_000),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('device-1'),
  getRefreshToken: vi.fn().mockResolvedValue('stored-refresh-token'),
  storeTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/config', () => ({
  getApiBaseUrl: () => 'http://localhost/api',
}));

/**
 * The server records spin history when it picks, so a mobile spin is one request and the
 * app has no way left to record a spin a second time.
 */
describe('mobile api client spin', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          selection: { plexId: '1', title: 'Inception', type: 'movie' },
          playLinks: null,
          stats: { totalMatches: 3 },
        }),
      } as Response)
    );
  });

  it('spins with one request to the selection route', async () => {
    const { coreApi } = await import('@/api/client');

    const response = await coreApi.spin({
      libraryIds: ['lib-1'],
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

    expect(response.selection.plexId).toBe('1');
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(['http://localhost/api/selection/random']);
  });

  it('offers no call that records spin history', async () => {
    const { coreApi } = await import('@/api/client');
    expect(Object.keys(coreApi)).not.toContain('recordSpinHistory');
  });
});
