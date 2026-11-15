import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import { clearTestCookies, getTestCookie } from '../../helpers/cookies';
import { seedConfiguredSettings, seedTestUser } from '../../helpers/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';

const plexOAuthMocks = vi.hoisted(() => ({
  fetchPlexUser: vi.fn(),
}));

const plexServiceMock = vi.hoisted(() => ({
  getServers: vi.fn(),
}));

vi.mock('@/lib/services/plex-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/plex-oauth')>();
  return {
    ...actual,
    fetchPlexUser: plexOAuthMocks.fetchPlexUser,
  };
});

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexServiceMock;
  }),
}));

import { completePlexLogin } from '@/lib/auth-login';

describe('completePlexLogin', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.clearAllMocks();
    plexOAuthMocks.fetchPlexUser.mockResolvedValue({
      id: 'plex-user-1',
      username: 'plexuser',
      email: 'plex@example.com',
      thumb: 'thumb.jpg',
    });
    plexServiceMock.getServers.mockResolvedValue([
      {
        name: 'Home',
        clientIdentifier: 'machine-1',
        owned: true,
        connections: [{ uri: 'http://192.168.1.10:32400', local: true, relay: false }],
      },
    ]);
  });

  it('completes first-run setup with an owned Plex server and issues a session', async () => {
    const result = await completePlexLogin('first-run-token', {
      setupTmdbApiKey: 'tmdb-test-key-abcdefgh',
    });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ username: 'plexuser', isAdmin: true });
    expect(result.requiresSetup).toBe(false);
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const settings = await getOrCreateSettings();
    const user = await User.findOne({ plexUserId: 'plex-user-1' });
    expect(settings.setupComplete).toBe(true);
    expect(settings.plexServerUrl).toBe('http://192.168.1.10:32400');
    expect(settings.plexMachineId).toBe('machine-1');
    expect(settings.getDecryptedTmdbKey()).toBe('tmdb-test-key-abcdefgh');
    expect(String(settings.adminUserId)).toBe(String(user?._id));
    expect(user?.isAdmin).toBe(true);
    expect(user?.isApproved).toBe(true);
  });

  it('allows a configured, approved non-admin user to log in', async () => {
    await seedConfiguredSettings();
    const settings = await getOrCreateSettings();
    const admin = await seedTestUser({
      plexUserId: 'admin-user',
      plexUsername: 'admin',
      isAdmin: true,
      isApproved: true,
    });
    settings.adminUserId = admin._id;
    settings.approvedPlexUserIds = ['plex-user-1'];
    await settings.save();
    plexServiceMock.getServers.mockResolvedValue([
      {
        name: 'Shared Server',
        clientIdentifier: 'machine-1',
        owned: false,
        connections: [{ uri: 'http://192.168.1.10:32400', local: true, relay: false }],
      },
    ]);

    const result = await completePlexLogin('approved-user-token');

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ username: 'plexuser', isAdmin: false });
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const user = await User.findOne({ plexUserId: 'plex-user-1' });
    expect(user?.isAdmin).toBe(false);
    expect(user?.isApproved).toBe(true);
  });

  it('blocks configured users who have Plex access but are not approved', async () => {
    await seedConfiguredSettings();
    plexServiceMock.getServers.mockResolvedValue([
      {
        name: 'Shared Server',
        clientIdentifier: 'machine-1',
        owned: false,
        connections: [{ uri: 'http://192.168.1.10:32400', local: true, relay: false }],
      },
    ]);

    const result = await completePlexLogin('unapproved-token');

    expect(result).toMatchObject({
      success: false,
      status: 403,
      error: 'Authentication failed',
      code: 'NOT_APPROVED',
    });
    expect(getTestCookie('decidarr_session')).toBeUndefined();
  });

  it('returns a service unavailable result when Plex user lookup is unavailable', async () => {
    plexOAuthMocks.fetchPlexUser.mockRejectedValue(new Error('PLEX_UNAVAILABLE'));

    const result = await completePlexLogin('token');

    expect(result).toMatchObject({
      success: false,
      status: 503,
    });
  });
});
