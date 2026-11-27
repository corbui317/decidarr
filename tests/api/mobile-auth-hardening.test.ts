import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { clearDatabase } from '../helpers/mongo';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { MobileAuthCode } from '@/lib/models/MobileAuthCode';
import { User } from '@/lib/models/User';
import { MobileRefreshToken } from '@/lib/models/MobileRefreshToken';
import { runMigrations, resetMigrationStateForTests } from '@/lib/migrate';
import { issueTokenPair } from '@/lib/mobile-auth/tokens';
import { deriveKey, isCurrentCiphertext } from '@/lib/secrets';
import {
  fakeIntegrations,
  fakePlexTv,
  type FakePlexTvOptions,
  type SentRequest,
} from '../helpers/fake-integrations';

const PLEX_TOKEN = 'plex-token-hardening-test';

vi.mock('@/lib/auth-login', () => ({
  completePlexLogin: vi.fn(),
}));

import { POST as startPost } from '@/app/api/mobile/auth/start/route';
import { POST as exchangePost } from '@/app/api/mobile/auth/exchange/route';
import { POST as refreshPost } from '@/app/api/mobile/auth/refresh/route';
import { GET as bootstrapGet } from '@/app/api/v1/sync/bootstrap/route';
import { completePlexLogin } from '@/lib/auth-login';

const DEVICE_ID = 'device-hardening-1';

let plexTv: FakePlexTvOptions;
let sent: SentRequest[];

const pinsCreated = () => sent.filter((r) => r.method === 'POST' && r.url.pathname === '/api/v2/pins');
const pinPolls = () => sent.filter((r) => r.url.pathname.startsWith('/api/v2/pins/'));

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
    plexTv = { pin: { id: 777, code: 'PIN777' }, authToken: PLEX_TOKEN };
    ({ sent } = fakeIntegrations(fakePlexTv(plexTv)));
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
      expect(pinsCreated()).toEqual([]);

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
      expect(isCurrentCiphertext(stored!.plexAuthToken!)).toBe(true);
      expect(stored?.plexAuthToken).not.toContain(PLEX_TOKEN);

      expect(stored?.getDecryptedPlexAuthToken()).toBe(PLEX_TOKEN);
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
      expect(pinPolls()).toHaveLength(1);
      expect(vi.mocked(completePlexLogin)).toHaveBeenLastCalledWith(PLEX_TOKEN);

      const stored = await MobileAuthCode.findOne({ deviceCode });
      expect(stored?.exchangedAt).toBeInstanceOf(Date);
      expect(stored?.plexAuthToken).toBeUndefined();
    });

    it('rate limits repeated exchanges of one device code', async () => {
      plexTv.authToken = null;

      const deviceCode = await startDeviceCode();
      let lastStatus = 0;
      for (let i = 0; i < 61; i++) {
        lastStatus = (await exchangePost(exchangeRequest(deviceCode))).status;
      }

      expect(lastStatus).toBe(429);
      expect(pinPolls()).toHaveLength(60);
    });
  });

  describe('typed session errors on bearer routes', () => {
    it('answers an expired access token with 401 UNAUTHENTICATED, not a server error', async () => {
      const user = await seedTestUser();
      const expired = jwt.sign(
        {
          sub: user._id.toString(),
          plexUserId: user.plexUserId,
          isAdmin: user.isAdmin,
          sessionVersion: user.sessionVersion,
          deviceId: DEVICE_ID,
          aud: 'decidarr-mobile',
        },
        deriveKey('mobile-access-token'),
        { expiresIn: -10 }
      );

      const response = await bootstrapGet(
        new NextRequest('http://localhost/api/v1/sync/bootstrap', {
          headers: { Authorization: `Bearer ${expired}` },
        })
      );

      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('UNAUTHENTICATED');
    });

    it('answers a revoked session with 401 UNAUTHENTICATED', async () => {
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
      expect((await response.json()).code).toBe('UNAUTHENTICATED');
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
      expect(isCurrentCiphertext(migrated!.plexAuthToken!)).toBe(true);
      expect(migrated?.getDecryptedPlexAuthToken()).toBe(PLEX_TOKEN);

      // A second run leaves already-migrated values untouched.
      const before = migrated?.plexAuthToken;
      resetMigrationStateForTests();
      await runMigrations();
      const again = await MobileAuthCode.findOne({ deviceCode: 'legacy-device-code' });
      expect(again?.plexAuthToken).toBe(before);
    });

    it('asks a device to sign in again when its user has no Plex server token', async () => {
      const user = await seedTestUser();
      const tokens = await issueTokenPair(user, DEVICE_ID);
      await User.updateOne({ _id: user._id }, { $unset: { plexServerToken: 1 } });

      const res = await refreshPost(
        new NextRequest('http://localhost/api/mobile/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken, deviceId: DEVICE_ID }),
        })
      );

      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');
    });

    it('refuses refresh after a DECIDARR_SECRET change without revoking anything', async () => {
      const refresh = (refreshToken: string) =>
        refreshPost(
          new NextRequest('http://localhost/api/mobile/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken, deviceId: DEVICE_ID }),
          })
        );
      vi.stubEnv('DECIDARR_SECRET', 'secret-a-0123456789abcdef0123456789abcdef');
      const user = await seedTestUser();
      const tokens = await issueTokenPair(user, DEVICE_ID);

      // The user's Plex token no longer decrypts, so the device has to sign in again.
      vi.stubEnv('DECIDARR_SECRET', 'secret-b-0123456789abcdef0123456789abcdef');
      expect((await refresh(tokens.refreshToken)).status).toBe(401);
      const stored = await MobileRefreshToken.findOne({ userId: user._id });
      expect(stored?.revokedAt).toBeUndefined();

      // Restoring the secret restores the sign-in.
      vi.stubEnv('DECIDARR_SECRET', 'secret-a-0123456789abcdef0123456789abcdef');
      expect((await refresh(tokens.refreshToken)).status).toBe(200);
    });
  });
});
