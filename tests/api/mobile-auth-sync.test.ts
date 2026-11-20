import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as startPost } from '@/app/api/mobile/auth/start/route';
import { POST as exchangePost } from '@/app/api/mobile/auth/exchange/route';
import { POST as refreshPost } from '@/app/api/mobile/auth/refresh/route';
import { GET as bootstrapGet } from '@/app/api/v1/sync/bootstrap/route';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { clearDatabase } from '../helpers/mongo';
import { clearRateLimitStore } from '@/lib/security/rate-limit';

vi.mock('@/lib/services/plex-oauth', () => ({
  createAuthPin: vi.fn().mockResolvedValue({ id: 12345, code: 'ABCD' }),
  buildPlexAuthUrl: vi.fn().mockReturnValue('https://app.plex.tv/auth#?code=ABCD'),
  pollAuthPin: vi.fn().mockResolvedValue({ id: 12345, code: 'ABCD', authToken: 'plex-token-test' }),
}));

vi.mock('@/lib/auth-login', () => ({
  completePlexLogin: vi.fn().mockResolvedValue({
    success: true,
    user: {
      id: 'user-id-placeholder',
      username: 'mobileuser',
      serverUrl: 'http://192.168.1.10:32400',
      isAdmin: false,
    },
  }),
}));

describe('mobile auth and sync API', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearRateLimitStore();
    await seedConfiguredSettings();
  });

  it('starts device authorization with rate-limited public endpoint', async () => {
    const request = new NextRequest('http://localhost/api/mobile/auth/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'device-12345678', deviceName: 'Test Phone' }),
    });

    const response = await startPost(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.authUrl).toContain('plex.tv');
    expect(data.deviceCode).toBeTruthy();
    expect(data.expiresAt).toBeTruthy();
  });

  it('rejects auth start without deviceId', async () => {
    const request = new NextRequest('http://localhost/api/mobile/auth/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await startPost(request);
    expect(response.status).toBe(400);
  });

  it('exchanges device code for token pair', async () => {
    const user = await seedTestUser({ plexUsername: 'mobileuser' });
    const { completePlexLogin } = await import('@/lib/auth-login');
    vi.mocked(completePlexLogin).mockResolvedValueOnce({
      success: true,
      user: {
        id: user._id.toString(),
        username: 'mobileuser',
        serverUrl: 'http://192.168.1.10:32400',
        isAdmin: true,
      },
    });

    const startRequest = new NextRequest('http://localhost/api/mobile/auth/start', {
      method: 'POST',
      body: JSON.stringify({ deviceId: 'device-12345678' }),
    });
    const startResponse = await startPost(startRequest);
    const startData = await startResponse.json();

    const exchangeRequest = new NextRequest('http://localhost/api/mobile/auth/exchange', {
      method: 'POST',
      body: JSON.stringify({
        deviceCode: startData.deviceCode,
        deviceId: 'device-12345678',
      }),
    });

    const exchangeResponse = await exchangePost(exchangeRequest);
    const exchangeData = await exchangeResponse.json();

    expect(exchangeResponse.status).toBe(200);
    expect(exchangeData.accessToken).toBeTruthy();
    expect(exchangeData.refreshToken).toBeTruthy();
    expect(exchangeData.user.username).toBe('mobileuser');
    expect(exchangeData).not.toHaveProperty('plexToken');
  });

  it('bootstraps sync data with bearer token', async () => {
    const user = await seedTestUser();
    const { issueTokenPair } = await import('@/lib/mobile-auth/tokens');
    const tokens = await issueTokenPair(user, 'device-12345678');

    const request = new NextRequest('http://localhost/api/v1/sync/bootstrap', {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    const response = await bootstrapGet(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.schemaVersion).toBe(1);
    expect(data.entities.preferences).toBeDefined();
    expect(Array.isArray(data.entities.watched)).toBe(true);
    expect(Array.isArray(data.entities.spinHistory)).toBe(true);
  });

  it('rotates refresh tokens', async () => {
    const user = await seedTestUser();
    const { issueTokenPair } = await import('@/lib/mobile-auth/tokens');
    const tokens = await issueTokenPair(user, 'device-rotate-test');

    const request = new NextRequest('http://localhost/api/mobile/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refreshToken: tokens.refreshToken,
        deviceId: 'device-rotate-test',
      }),
    });

    const response = await refreshPost(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).not.toBe(tokens.refreshToken);
  });
});
