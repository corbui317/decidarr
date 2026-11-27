import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth/session', () => ({
  getAccessToken: vi.fn().mockResolvedValue('stale-token'),
  getAccessTokenExpiresAt: vi.fn().mockResolvedValue(Date.now() - 1000),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('device-1'),
  getRefreshToken: vi.fn().mockResolvedValue('stored-refresh-token'),
  storeTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/config', () => ({
  getApiBaseUrl: () => 'http://localhost/api',
}));

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Live bug 7 (offline variant): refresh() used to turn every error - including no
 * network and a 5xx from the refresh endpoint - into a failed refresh, so an offline
 * user near expiry was marked reauth_required even though their refresh token was
 * never actually rejected by the server.
 */
describe('mobile api client refresh (offline vs. rejected token)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('does not sign the user out when the refresh request fails with a network error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError('Network request failed'));

    const { getValidAccessToken } = await import('@/api/client');

    await expect(getValidAccessToken()).rejects.toThrow('Network request failed');
  });

  it('does not sign the user out when the refresh endpoint returns a 5xx', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(503, { error: 'Service unavailable' }));

    const { getValidAccessToken } = await import('@/api/client');

    await expect(getValidAccessToken()).rejects.toMatchObject({ status: 503 });
  });

  it('signs the user out when the server actually rejects the refresh token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(401, { error: 'Invalid refresh token', code: 'REFRESH_REJECTED' })
    );

    const { getValidAccessToken } = await import('@/api/client');

    await expect(getValidAccessToken()).resolves.toBeNull();
  });

  it('refreshes successfully when the server accepts the refresh token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 })
    );

    const { getValidAccessToken } = await import('@/api/client');

    await expect(getValidAccessToken()).resolves.toBe('new-access');
  });
});
