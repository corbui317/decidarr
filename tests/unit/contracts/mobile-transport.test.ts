import { describe, it, expect, vi } from 'vitest';
import { createMobileTransport } from '@decidarr/api-contracts';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Live bug 7: the mobile app only refreshed its access token when none was stored at
 * all, so a token that was merely close to expiring (or already expired server-side)
 * was sent as-is, and the user got signed out instead of silently refreshed.
 * Exercises the transport seam with a fake transport (fake fetch + fake refresh), no
 * React Native, per the mobile client testing approach in spec #18.
 */
describe('mobile access token refresh (live bug 7)', () => {
  it('refreshes before the stored token expires, without waiting for a 401', async () => {
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh',
      expiresIn: 900,
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));

    const transport = createMobileTransport({
      baseUrl: 'http://localhost/api',
      getAccessToken: async () => 'stale-token',
      getExpiresAt: async () => Date.now() + 1000, // expiring in 1s, well inside the refresh skew
      refresh,
      fetchImpl,
    });

    const token = await transport.getValidAccessToken();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(token).toBe('fresh-token');
  });

  it('retries a request once after a 401, using the refreshed token', async () => {
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'fresh-token',
      refreshToken: 'fresh-refresh',
      expiresIn: 900,
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unauthorized', code: 'UNAUTHENTICATED' }))
      .mockResolvedValueOnce(jsonResponse(200, { entities: {} }));

    const transport = createMobileTransport({
      baseUrl: 'http://localhost/api',
      getAccessToken: async () => 'valid-looking-token',
      getExpiresAt: async () => Date.now() + 10 * 60_000, // not close to expiring
      refresh,
      fetchImpl,
    });

    const result = await transport.request<{ entities: unknown }>('/v1/sync/bootstrap');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ entities: {} });
  });

  it('signs the user out only when the refresh call itself fails, not merely on a 401', async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' }));

    const transport = createMobileTransport({
      baseUrl: 'http://localhost/api',
      getAccessToken: async () => 'expired-token',
      getExpiresAt: async () => Date.now() - 1000,
      refresh,
      fetchImpl,
    });

    const token = await transport.getValidAccessToken();
    expect(token).toBeNull();

    await expect(transport.request('/v1/sync/bootstrap')).rejects.toMatchObject({ status: 401 });
  });
});
