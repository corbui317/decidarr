import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../../helpers/mongo';
import { clearTestCookies } from '../../helpers/auth';
import { clearRateLimitStore } from '@/lib/security/rate-limit';

const plexOAuthMock = {
  createAuthPin: vi.fn(),
  pollAuthPin: vi.fn(),
  fetchPlexUser: vi.fn(),
};

const plexMock = {
  getServers: vi.fn(),
};

vi.mock('@/lib/services/plex-oauth', () => ({
  createAuthPin: (...args: unknown[]) => plexOAuthMock.createAuthPin(...args),
  pollAuthPin: (...args: unknown[]) => plexOAuthMock.pollAuthPin(...args),
  fetchPlexUser: (...args: unknown[]) => plexOAuthMock.fetchPlexUser(...args),
  buildPlexAuthUrl: (code: string, options?: { forwardUrl?: string }) => {
    const params = new URLSearchParams({ code });
    if (options?.forwardUrl) {
      params.append('forwardUrl', options.forwardUrl);
    }
    return `https://app.plex.tv/auth#?${params.toString()}`;
  },
  generateOAuthState: () => 'test-state-123',
  OAUTH_STATE_COOKIE: 'decidarr_oauth_state',
  OAUTH_PIN_COOKIE: 'decidarr_oauth_pin',
  OAUTH_PIN_CODE_COOKIE: 'decidarr_oauth_pin_code',
  getOAuthCookieOptions: () => ({ httpOnly: true, sameSite: 'lax' as const, maxAge: 600 }),
}));

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

import { POST as plexStartPost } from '@/app/api/auth/plex/start/route';
import { GET as plexPollGet } from '@/app/api/auth/plex/poll/route';
import { POST as loginPost } from '@/app/api/auth/login/route';

describe('Auth hardening', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    clearRateLimitStore();
    vi.clearAllMocks();
    plexOAuthMock.createAuthPin.mockResolvedValue({ id: 123, code: 'ABC123' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('Rate limiting', () => {
    it('returns 429 after multiple rapid attempts on /api/auth/login', async () => {
      const makeRequest = () => loginPost(new Request('http://localhost/api/auth/login', { method: 'POST' }));

      const responses = [];
      for (let i = 0; i < 6; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);

      const rateLimitedResponse = responses.find((r) => r.status === 429);
      if (rateLimitedResponse) {
        const body = await rateLimitedResponse.json();
        expect(body.error).toMatch(/try again later/i);
        expect(body.code).toBe('RATE_LIMITED');
      }
    });

    it('returns 429 after multiple rapid login attempts on /api/auth/plex/start', async () => {
      const makeRequest = () => plexStartPost(new Request('http://localhost/api/auth/plex/start', { method: 'POST' }));

      const responses = [];
      for (let i = 0; i < 6; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);

      const rateLimitedResponse = responses.find((r) => r.status === 429);
      if (rateLimitedResponse) {
        const body = await rateLimitedResponse.json();
        expect(body.error).toMatch(/try again later/i);
        expect(body.code).toBe('RATE_LIMITED');
      }
    });

    it('returns 429 after many rapid poll attempts on /api/auth/plex/poll', async () => {
      const { setTestCookie } = await import('../../helpers/cookies');
      plexOAuthMock.pollAuthPin.mockResolvedValue({ authToken: null });

      setTestCookie('decidarr_oauth_pin', '123');
      setTestCookie('decidarr_oauth_pin_code', 'ABC123');
      setTestCookie('decidarr_oauth_state', 'test-state-123');

      const makeRequest = () => {
        return plexPollGet(new NextRequest('http://localhost/api/auth/plex/poll?state=test-state-123'));
      };

      const responses = [];
      for (let i = 0; i < 25; i++) {
        responses.push(await makeRequest());
      }

      const statuses = responses.map((r) => r.status);
      const rateLimitedCount = statuses.filter((s) => s === 429).length;

      expect(rateLimitedCount).toBeGreaterThan(0);

      const rateLimitedResponse = responses.find((r) => r.status === 429);
      if (rateLimitedResponse) {
        const body = await rateLimitedResponse.json();
        expect(body.error).toMatch(/try again later/i);
        expect(body.code).toBe('RATE_LIMITED');
      }
    });
  });

  describe('Redirect validation', () => {
    it('builds redirect URL from request origin', async () => {
      const res = await plexStartPost(new Request('http://localhost:3000/api/auth/plex/start', { method: 'POST' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authUrl).toContain('forwardUrl=http%3A%2F%2Flocalhost%3A3000%2F');
    });

    it('uses https protocol for secure requests', async () => {
      const req = new Request('https://decidarr.example.com/api/auth/plex/start', { method: 'POST' });
      const res = await plexStartPost(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.authUrl).toContain('forwardUrl=https%3A%2F%2Fdecidarr.example.com%2F');
    });
  });

  describe('Generic errors and typed codes', () => {
    it('returns generic error with NO_OWNED_SERVER code when user has no owned server during setup', async () => {
      const { setTestCookie } = await import('../../helpers/cookies');

      plexOAuthMock.fetchPlexUser.mockResolvedValue({
        id: 'plex-user-1',
        username: 'newuser',
        email: 'newuser@example.com',
        thumb: 'https://plex.tv/users/avatar.png',
      });

      plexMock.getServers.mockResolvedValue([
        {
          name: 'Friend Server',
          clientIdentifier: 'friend-machine-1',
          connections: [{ uri: 'http://192.168.1.20:32400', local: true }],
          owned: false,
        },
      ]);

      plexOAuthMock.pollAuthPin.mockResolvedValue({ authToken: 'valid-token-123' });

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

      plexOAuthMock.fetchPlexUser.mockResolvedValue({
        id: 'other-user-2',
        username: 'frienduser',
        email: 'friend@example.com',
        thumb: 'https://plex.tv/users/avatar2.png',
      });

      plexMock.getServers.mockResolvedValue([]);

      plexOAuthMock.pollAuthPin.mockResolvedValue({ authToken: 'friend-token' });

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
