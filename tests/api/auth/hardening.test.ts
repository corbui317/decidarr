import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../../helpers/mongo';
import { clearTestCookies } from '../../helpers/auth';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { fakeIntegrations, fakePlexTv } from '../../helpers/fake-integrations';

import { POST as plexStartPost } from '@/app/api/auth/plex/start/route';
import { GET as plexPollGet } from '@/app/api/auth/plex/poll/route';
import { POST as loginPost } from '@/app/api/auth/login/route';

describe('Auth hardening', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    fakeIntegrations(fakePlexTv());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Rate limiting', () => {
    it('returns 429 after exhausting the global ceiling on /api/auth/login', async () => {
      // No TRUST_PROXY and no client-supplied identity: these requests are indistinguishable,
      // so only the per-endpoint global ceiling (not a shared per-client bucket) applies.
      const makeRequest = () => loginPost(new Request('http://localhost/api/auth/login', { method: 'POST' }));

      const responses = [];
      for (let i = 0; i < 51; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      expect(statuses.slice(0, 50)).toEqual(Array(50).fill(410));
      expect(statuses[50]).toBe(429);

      const rateLimitedResponse = responses[50];
      const body = await rateLimitedResponse.json();
      expect(body.error).toMatch(/try again later/i);
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('returns 429 after exhausting the global ceiling on /api/auth/plex/start', async () => {
      const makeRequest = () => plexStartPost(new Request('http://localhost/api/auth/plex/start', { method: 'POST' }));

      const responses = [];
      for (let i = 0; i < 51; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);

      const rateLimitedResponse = responses.find((r) => r.status === 429)!;
      const body = await rateLimitedResponse.json();
      expect(body.error).toMatch(/try again later/i);
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('with TRUST_PROXY=true, uses the forwarded client IP to rate limit /api/auth/plex/start per client', async () => {
      vi.stubEnv('TRUST_PROXY', 'true');
      const makeRequest = (ip: string) =>
        plexStartPost(
          new Request('http://localhost/api/auth/plex/start', {
            method: 'POST',
            headers: { 'x-forwarded-for': ip },
          })
        );

      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await makeRequest('203.0.113.9')).status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);

      // A different forwarded client IP gets its own bucket.
      expect((await makeRequest('203.0.113.42')).status).toBe(200);
    });

    it('allows normal OAuth polling without rate limiting', async () => {
      const { setTestCookie } = await import('../../helpers/cookies');

      setTestCookie('decidarr_oauth_pin', '123');
      setTestCookie('decidarr_oauth_pin_code', 'ABC123');
      setTestCookie('decidarr_oauth_state', 'test-state-123');

      const makeRequest = () => {
        return plexPollGet(new NextRequest('http://localhost/api/auth/plex/poll?state=test-state-123'));
      };

      // Simulate normal user behavior: 60 polls over 2 minutes (~10s on plex.tv)
      // Poll limit is 300 per 10 minutes, so this should succeed
      const responses = [];
      for (let i = 0; i < 60; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      // Should not hit rate limit with normal polling
      expect(rateLimitedCount).toBe(0);

      // All responses should be 200 with authorized: false (not yet authorized)
      const successCount = statuses.filter((s) => s === 200).length;
      expect(successCount).toBe(60);
    });

    it('returns 429 after excessive polling attempts on a single pin', async () => {
      const { setTestCookie } = await import('../../helpers/cookies');

      setTestCookie('decidarr_oauth_pin', '456');
      setTestCookie('decidarr_oauth_pin_code', 'XYZ789');
      setTestCookie('decidarr_oauth_state', 'test-state-456');

      const makeRequest = () => {
        return plexPollGet(new NextRequest('http://localhost/api/auth/plex/poll?state=test-state-456'));
      };

      // Simulate excessive polling: 301 attempts (exceeds 300 limit)
      const responses = [];
      for (let i = 0; i < 301; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      // Should hit rate limit after 300 attempts
      expect(rateLimitedCount).toBeGreaterThan(0);

      const rateLimitedResponse = responses.find((r) => r.status === 429);
      if (rateLimitedResponse) {
        const body = await rateLimitedResponse.json();
        expect(body.error).toMatch(/try again/i);
        expect(body.code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('Redirect validation', () => {
    it('omits forwardUrl when the Host header does not match APP_URL', async () => {
      vi.stubEnv('APP_URL', 'https://decidarr.example.com');

      // Next builds request.url from the Host header, so a spoofed Host changes its origin.
      const res = await plexStartPost(
        new Request('https://evil.example/api/auth/plex/start', {
          method: 'POST',
          headers: { host: 'evil.example' },
        })
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authUrl).not.toContain('forwardUrl');
      expect(body.authUrl).not.toContain('evil.example');
    });

    it('omits forwardUrl when APP_URL is not configured', async () => {
      vi.stubEnv('APP_URL', '');
      vi.stubEnv('NEXTAUTH_URL', '');

      const res = await plexStartPost(new Request('http://localhost:3000/api/auth/plex/start', { method: 'POST' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authUrl).not.toContain('forwardUrl');
    });

    it('builds redirect URL from request origin', async () => {
      const originalAppUrl = process.env.APP_URL;
      process.env.APP_URL = 'http://localhost:3000';

      const res = await plexStartPost(new Request('http://localhost:3000/api/auth/plex/start', { method: 'POST' }));
      const body = await res.json();

      process.env.APP_URL = originalAppUrl;

      expect(res.status).toBe(200);
      expect(body.authUrl).toContain('forwardUrl=http%3A%2F%2Flocalhost%3A3000%2F');
    });

    it('uses https protocol for secure requests', async () => {
      const originalAppUrl = process.env.APP_URL;
      process.env.APP_URL = 'https://decidarr.example.com';

      const req = new Request('https://decidarr.example.com/api/auth/plex/start', { method: 'POST' });
      const res = await plexStartPost(req);
      const body = await res.json();

      process.env.APP_URL = originalAppUrl;

      expect(res.status).toBe(200);
      expect(body.authUrl).toContain('forwardUrl=https%3A%2F%2Fdecidarr.example.com%2F');
    });
  });

  describe('Generic errors and typed codes', () => {
    it('returns generic error with NO_OWNED_SERVER code when user has no owned server during setup', async () => {
      const { setTestCookie } = await import('../../helpers/cookies');

      fakeIntegrations(
        fakePlexTv({
          authToken: 'valid-token-123',
          account: { id: 'plex-user-1', username: 'newuser', email: 'newuser@example.com' },
          servers: [
            { name: 'Friend Server', clientIdentifier: 'friend-machine-1', owned: false, uri: 'http://192.168.1.20:32400' },
          ],
        })
      );

      setTestCookie('decidarr_oauth_pin', '123');
      setTestCookie('decidarr_oauth_pin_code', 'ABC123');
      setTestCookie('decidarr_oauth_state', 'test-state-123');

      const res = await plexPollGet(new NextRequest('http://localhost/api/auth/plex/poll?state=test-state-123'));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.code).toBe('NO_OWNED_SERVER');
      expect(body.error).not.toMatch(/owned Plex Media Server/i);
      expect(body.error).toMatch(/authentication failed/i);
    });

    it('returns generic error for access denied cases', async () => {
      const { seedConfiguredSettings, seedTestUser } = await import('../../helpers/auth');
      const { setTestCookie } = await import('../../helpers/cookies');

      await seedConfiguredSettings();
      await seedTestUser({ isAdmin: true, plexUserId: 'admin-user-1' });

      fakeIntegrations(
        fakePlexTv({
          authToken: 'friend-token',
          account: { id: 'other-user-2', username: 'frienduser', email: 'friend@example.com' },
          servers: [],
        })
      );

      setTestCookie('decidarr_oauth_pin', '456');
      setTestCookie('decidarr_oauth_pin_code', 'XYZ789');
      setTestCookie('decidarr_oauth_state', 'test-state-123');

      const res = await plexPollGet(new NextRequest('http://localhost/api/auth/plex/poll?state=test-state-123'));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).not.toMatch(/do not have access/i);
      expect(body.error).toMatch(/authentication failed/i);
      expect(body.code).toBeDefined();
    });
  });
});
