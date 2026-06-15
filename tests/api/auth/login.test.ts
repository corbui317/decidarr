import { vi, describe, it, expect, beforeEach } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import {
  seedConfiguredSettings,
  authenticateTestSession,
  clearTestCookies,
  createJsonRequest,
} from '../../helpers/auth';

const plexMock = {
  validateToken: vi.fn(),
  getServers: vi.fn(),
  getLibrarySections: vi.fn(),
  getCollectionItems: vi.fn(),
  getItemMetadata: vi.fn(),
  fetchMachineIdFromServer: vi.fn(),
  buildPlayLinks: vi.fn(),
};

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

import { GET as statusGet } from '@/app/api/settings/status/route';
import { POST as setupPost } from '@/app/api/settings/setup/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { GET as meGet } from '@/app/api/auth/me/route';
import { POST as testPlexPost } from '@/app/api/settings/test-plex/route';
import { getOrCreateSettings } from '@/lib/models/Settings';

describe('Auth and setup API routes', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    plexMock.validateToken.mockResolvedValue({
      valid: true,
      user: { id: '1', username: 'testuser', email: 'test@example.com' },
    });
    plexMock.getServers.mockResolvedValue([
      {
        name: 'Home',
        clientIdentifier: 'machine-1',
        connections: [{ uri: 'http://192.168.1.10:32400', local: true, relay: false }],
      },
    ]);
  });

  describe('GET /api/settings/status', () => {
    it('returns setupComplete false for fresh install', async () => {
      const res = await statusGet();
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.setupComplete).toBe(false);
    });

    it('returns configured status after setup', async () => {
      await seedConfiguredSettings();
      const res = await statusGet();
      const body = await res.json();
      expect(body.setupComplete).toBe(true);
      expect(body.hasPlexToken).toBe(true);
      expect(body.plexUsername).toBe('testuser');
    });
  });

  describe('POST /api/settings/setup', () => {
    it('rejects missing Plex token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {});
      const res = await setupPost(req as never);
      expect(res.status).toBe(400);
    });

    it('rejects invalid Plex token', async () => {
      plexMock.validateToken.mockResolvedValue({ valid: false, error: 'Invalid' });
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {
        plexToken: 'bad-token',
      });
      const res = await setupPost(req as never);
      expect(res.status).toBe(401);
    });

    it('rejects SSRF server URLs', async () => {
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {
        plexToken: 'valid-token',
        plexServerUrl: 'http://169.254.169.254',
      });
      const res = await setupPost(req as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid server URL/i);
    });

    it('completes setup with valid token and server', async () => {
      const req = createJsonRequest('http://localhost/api/settings/setup', 'POST', {
        plexToken: 'valid-token',
        plexServerUrl: 'http://192.168.1.10:32400',
      });
      const res = await setupPost(req as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.plex.username).toBe('testuser');

      const settings = await getOrCreateSettings();
      expect(settings.setupComplete).toBe(true);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 400 when app not configured', async () => {
      const res = await loginPost();
      expect(res.status).toBe(400);
    });

    it('returns 401 when Plex token expired', async () => {
      await seedConfiguredSettings();
      plexMock.validateToken.mockResolvedValue({ valid: false, error: 'Expired' });
      const res = await loginPost();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.requiresSetup).toBe(true);
    });

    it('issues session on successful login', async () => {
      await seedConfiguredSettings();
      const res = await loginPost();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user.username).toBe('testuser');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without session', async () => {
      await seedConfiguredSettings();
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns user when session valid', async () => {
      await seedConfiguredSettings();
      await authenticateTestSession();
      const res = await meGet();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user.username).toBe('testuser');
    });
  });

  describe('POST /api/settings/test-plex', () => {
    it('requires Plex token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {});
      const res = await testPlexPost(req as never);
      expect(res.status).toBe(400);
    });

    it('rejects invalid server URL', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {
        plexToken: 'token',
        plexServerUrl: 'http://localhost:32400',
      });
      const res = await testPlexPost(req as never);
      expect(res.status).toBe(400);
    });

    it('returns valid for good token', async () => {
      const req = createJsonRequest('http://localhost/api/settings/test-plex', 'POST', {
        plexToken: 'valid-token',
      });
      const res = await testPlexPost(req as never);
      const body = await res.json();
      expect(body.valid).toBe(true);
      expect(body.user.username).toBe('testuser');
    });
  });
});
