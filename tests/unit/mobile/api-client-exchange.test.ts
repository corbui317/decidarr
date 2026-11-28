import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth/session', () => ({
  getAccessToken: vi.fn().mockResolvedValue(null),
  getAccessTokenExpiresAt: vi.fn().mockResolvedValue(null),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('device-1'),
  getRefreshToken: vi.fn().mockResolvedValue(null),
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
 * The server answers an exchange made before the user approved the sign-in on plex.tv
 * with 202 and no tokens. The app used to take that answer as a signed-in session and
 * store undefined tokens; it must report that sign-in is not finished instead.
 */
describe('mobile api client exchange', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('rejects an exchange the user has not yet approved on plex.tv', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(202, { authorized: false, error: 'Plex authorization not completed' }))
    );
    const { mobileAuthApi } = await import('@/api/client');

    await expect(mobileAuthApi.exchange({ deviceCode: 'code-1', deviceId: 'device-1' })).rejects.toThrow(
      'Plex authorization not completed'
    );
  });

  it('returns the tokens of an approved exchange', async () => {
    const tokens = {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
      user: { id: 'u1', username: 'friend', isAdmin: false },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, tokens)));
    const { mobileAuthApi } = await import('@/api/client');

    await expect(mobileAuthApi.exchange({ deviceCode: 'code-1', deviceId: 'device-1' })).resolves.toEqual(tokens);
  });
});
