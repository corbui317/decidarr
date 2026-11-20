import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { clearDatabase } from '../helpers/mongo';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { getOrCreateSettings, recoverFromSecretChange } from '@/lib/models/Settings';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { runMigrations, resetMigrationStateForTests } from '@/lib/migrate';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';

const PLEX_TOKEN = 'plex-token-hardening-test';

const plexOAuthMock = {
  createAuthPin: vi.fn(),
  pollAuthPin: vi.fn(),
};

vi.mock('@/lib/services/plex-oauth', () => ({
  createAuthPin: (...args: unknown[]) => plexOAuthMock.createAuthPin(...args),
  pollAuthPin: (...args: unknown[]) => plexOAuthMock.pollAuthPin(...args),
  fetchPlexUser: vi.fn(),
  buildPlexAuthUrl: (code: string, options?: { forwardUrl?: string }) => {
    const params = new URLSearchParams({ code });
    if (options?.forwardUrl) {
      params.append('forwardUrl', options.forwardUrl);
    }
    return `https://app.plex.tv/auth#?${params.toString()}`;
  },
}));

vi.mock('@/lib/auth-login', () => ({
  completePlexLogin: vi.fn(),
}));

import { POST as startPost } from '@/app/api/mobile/auth/start/route';
import { POST as exchangePost } from '@/app/api/mobile/auth/exchange/route';
import { POST as refreshPost } from '@/app/api/mobile/auth/refresh/route';
import { GET as bootstrapGet } from '@/app/api/v1/sync/bootstrap/route';
import { completePlexLogin } from '@/lib/auth-login';

const DEVICE_ID = 'device-hardening-1';

function startRequest(url = 'http://localhost/api/mobile/auth/start', headers?: HeadersInit) {
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deviceId: DEVICE_ID }),
  });
}

function exchangeRequest(deviceCode: string) {
  return new NextRequest('http://localhost/api/mobile/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ deviceCode, deviceId: DEVICE_ID }),
  });
}

async function startDeviceCode(): Promise<string> {
  const response = await startPost(startRequest());
  expect(response.status).toBe(200);
  return (await response.json()).deviceCode;
}

describe('Mobile auth hardening (spec #1 rules on the mobile routes)', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearRateLimitStore();
    resetMigrationStateForTests();
    vi.clearAllMocks();
    await seedConfiguredSettings();
    plexOAuthMock.createAuthPin.mockResolvedValue({ id: 777, code: 'PIN777' });
    plexOAuthMock.pollAuthPin.mockResolvedValue({ id: 777, code: 'PIN777', authToken: PLEX_TOKEN });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /api/mobile/auth/start', () => {
    it('rate limits with the shared limiter and a spoofed X-Forwarded-For does not reset it', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const response = await startPost(
          startRequest(undefined, { 'x-forwarded-for': `10.0.0.${i}` })
        );
        statuses.push(response.status);
        if (response.status === 429) {
          expect((await response.json()).code).toBe('RATE_LIMITED');
        }
      }

      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
    });

    it('omits forwardUrl when the request origin does not match APP_URL', async () => {
      vi.stubEnv('APP_URL', 'https://decidarr.example.com');

      const response = await startPost(startRequest('https://evil.example/api/mobile/auth/start'));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.authUrl).not.toContain('forwardUrl');
      expect(body.authUrl).not.toContain('evil.example');
    });

    it('sends Plex back to the app origin when it matches APP_URL', async () => {
      vi.stubEnv('APP_URL', 'https://decidarr.example.com');

      const response = await startPost(
        startRequest('https://decidarr.example.com/api/mobile/auth/start')
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.authUrl).toContain('forwardUrl=https%3A%2F%2Fdecidarr.example.com%2F');
    });

    it('requires the setup secret before setup is complete, like the browser sign-in', async () => {
      const settings = await getOrCreateSettings();
      settings.setupComplete = false;
      await settings.save();
      vi.stubEnv('DECIDARR_SETUP_SECRET', 'first-run-secret');

      const rejected = await startPost(startRequest());
      expect(rejected.status).toBe(403);
      expect((await rejected.json()).code).toBe('INVALID_SETUP_SECRET');
      expect(plexOAuthMock.createAuthPin).not.toHaveBeenCalled();

      const allowed = await startPost(
        startRequest(undefined, { 'X-Decidarr-Setup-Secret': 'first-run-secret' })
      );
      expect(allowed.status).toBe(200);
    });
  });

  describe('POST /api/mobile/auth/exchange', () => {
    it('stores the approved Plex token AES-256-GCM encrypted, never in plaintext', async () => {
      vi.mocked(completePlexLogin).mockResolvedValueOnce({
        success: false,
        error: 'Authentication failed',
        code: 'NOT_APPROVED',
        status: 403,
      });

      const deviceCode = await startDeviceCode();
      const response = await exchangePost(exchangeRequest(deviceCode));

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('NOT_APPROVED');

      const stored = await MobileAuthCode.findOne({ deviceCode });
      expect(stored?.plexAuthToken).toMatch(/^v2:/);
      expect(stored?.plexAuthToken).not.toContain(PLEX_TOKEN);

      const settings = await getOrCreateSettings();
      expect(stored?.getDecryptedPlexAuthToken(settings.getEncryptionKey())).toBe(PLEX_TOKEN);
    });

    it('reuses the encrypted token on retry and drops it once exchanged', async () => {
      const user = await seedTestUser({ plexUsername: 'mobileuser' });
      vi.mocked(completePlexLogin)
        .mockResolvedValueOnce({ success: false, error: 'Plex.tv is unavailable', status: 503 })
        .mockResolvedValueOnce({
          success: true,
          user: { id: user._id.toString(), username: 'mobileuser', serverUrl: '', isAdmin: true },
        });

      const deviceCode = await startDeviceCode();
      expect((await exchangePost(exchangeRequest(deviceCode))).status).toBe(503);

      const response = await exchangePost(exchangeRequest(deviceCode));
      expect(response.status).toBe(200);
      expect(plexOAuthMock.pollAuthPin).toHaveBeenCalledTimes(1);
      expect(vi.mocked(completePlexLogin)).toHaveBeenLastCalledWith(PLEX_TOKEN);

      const stored = await MobileAuthCode.findOne({ deviceCode });
      expect(stored?.exchangedAt).toBeInstanceOf(Date);
      expect(stored?.plexAuthToken).toBeUndefined();
    });

    it('rate limits repeated exchanges of one device code', async () => {
      plexOAuthMock.pollAuthPin.mockResolvedValue({ id: 777, code: 'PIN777' });

      const deviceCode = await startDeviceCode();
      let lastStatus = 0;
      for (let i = 0; i < 61; i++) {
        lastStatus = (await exchangePost(exchangeRequest(deviceCode))).status;
      }

      expect(lastStatus).toBe(429);
      expect(plexOAuthMock.pollAuthPin).toHaveBeenCalledTimes(60);
    });
  });

  describe('typed session errors on bearer routes', () => {
    it('answers an expired access token with 401 UNAUTHORIZED, not a server error', async () => {
      const user = await seedTestUser();
      const settings = await getOrCreateSettings();
      const expired = jwt.sign(
        {
          sub: user._id.toString(),
          plexUserId: user.plexUserId,
          isAdmin: user.isAdmin,
          sessionVersion: user.sessionVersion,
          deviceId: DEVICE_ID,
          aud: 'decidarr-mobile',
        },
        settings.getJwtSecret(),
        { expiresIn: -10 }
      );

      const response = await bootstrapGet(
        new NextRequest('http://localhost/api/v1/sync/bootstrap', {
          headers: { Authorization: `Bearer ${expired}` },
        })
      );

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('UNAUTHORIZED');
    });

    it('answers a revoked session with 401 UNAUTHORIZED', async () => {
      const user = await seedTestUser();
      const tokens = await issueTokenPair(user, DEVICE_ID);
      user.sessionVersion += 1;
      await user.save();

      const response = await bootstrapGet(
        new NextRequest('http://localhost/api/v1/sync/bootstrap', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
      );

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('UNAUTHORIZED');
    });

    it('answers an unknown refresh token with 401 UNAUTHORIZED', async () => {
      const response = await refreshPost(
        new NextRequest('http://localhost/api/mobile/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: 'not-a-real-token', deviceId: DEVICE_ID }),
        })
      );

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('UNAUTHORIZED');
    });
  });

  describe('secret migration and recovery cover mobile records', () => {
    it('encrypts a plaintext Plex token left on a pending mobile sign-in by an older version', async () => {
      await MobileAuthCode.collection.insertOne({
        deviceCode: 'legacy-device-code',
        deviceId: DEVICE_ID,
        pinId: 1,
        pinCode: 'LEGACY',
        plexAuthToken: PLEX_TOKEN,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });

      await runMigrations();

      const migrated = await MobileAuthCode.findOne({ deviceCode: 'legacy-device-code' });
      expect(migrated?.plexAuthToken).toMatch(/^v2:/);
      const settings = await getOrCreateSettings();
      expect(migrated?.getDecryptedPlexAuthToken(settings.getEncryptionKey())).toBe(PLEX_TOKEN);

      // A second run leaves already-migrated values untouched.
      const before = migrated?.plexAuthToken;
      resetMigrationStateForTests();
      await runMigrations();
      const again = await MobileAuthCode.findOne({ deviceCode: 'legacy-device-code' });
      expect(again?.plexAuthToken).toBe(before);
    });

    it('signs mobile devices out when DECIDARR_SECRET changes', async () => {
      const user = await seedTestUser();
      const tokens = await issueTokenPair(user, DEVICE_ID);
      const deviceCode = await startDeviceCode();

      await recoverFromSecretChange();

      expect(await MobileAuthCode.findOne({ deviceCode })).toBeNull();
      const refresh = await MobileRefreshToken.findOne({ userId: user._id });
      expect(refresh?.revokedAt).toBeInstanceOf(Date);

      const response = await refreshPost(
        new NextRequest('http://localhost/api/mobile/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken, deviceId: DEVICE_ID }),
        })
      );
      expect(response.status).toBe(401);
    });
  });
});
