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
 * Criterion 5: a revoked session must land every screen in the signed-out state, not
 * only a call that happens to go through AuthProvider's own getValidAccessToken - a
 * screen calling coreApi/syncApi directly must trigger the same signal.
 */
describe('mobile api client onReauthRequired (clean signed-out state from any call)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('notifies subscribers when coreApi hits a 401-rejected refresh, not only an explicit getValidAccessToken call', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(401, { error: 'Invalid refresh token', code: 'REFRESH_REJECTED' })
    );

    const { coreApi, onReauthRequired } = await import('@/api/client');
    const heard: boolean[] = [];
    const unsubscribe = onReauthRequired(() => heard.push(true));

    await expect(coreApi.getSections()).rejects.toBeTruthy();

    // The transport can reach a 401-rejected refresh from more than one internal path
    // for a single call (a proactive refresh before the request, a reactive one after
    // the request itself 401s); what matters is it fires at least once, not the count.
    expect(heard.length).toBeGreaterThanOrEqual(1);
    unsubscribe();
  });

  it('does not notify subscribers for a transient refresh failure (offline, 5xx)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(503, { error: 'Service unavailable' })
    );

    const { coreApi, onReauthRequired } = await import('@/api/client');
    const heard: boolean[] = [];
    const unsubscribe = onReauthRequired(() => heard.push(true));

    await expect(coreApi.getSections()).rejects.toBeTruthy();

    expect(heard).toEqual([]);
    unsubscribe();
  });

  it('stops notifying a subscriber once it unsubscribes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(401, { error: 'Invalid refresh token', code: 'REFRESH_REJECTED' })
    );

    const { getValidAccessToken, onReauthRequired } = await import('@/api/client');
    const heard: boolean[] = [];
    const unsubscribe = onReauthRequired(() => heard.push(true));
    unsubscribe();

    await expect(getValidAccessToken()).resolves.toBeNull();

    expect(heard).toEqual([]);
  });
});
