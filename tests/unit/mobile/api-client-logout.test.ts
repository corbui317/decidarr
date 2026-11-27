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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Mobile logout used to send the bearer access token so the server could also revoke
 * the session by device id, then stopped sending it when logout moved onto the shared
 * client. Restored: logout still sends whatever access token is stored, best-effort.
 */
describe('mobile api client logout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { success: true })));
  });

  it('sends the stored access token as a bearer header', async () => {
    const { mobileAuthApi } = await import('@/api/client');

    await mobileAuthApi.logout({ refreshToken: 'stored-refresh-token' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer current-access-token');
  });
});
