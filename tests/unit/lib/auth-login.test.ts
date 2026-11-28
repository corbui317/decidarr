import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearDatabase } from '../../helpers/mongo';
import { clearTestCookies, getTestCookie } from '../../helpers/cookies';
import { seedConfiguredSettings, seedTestUser } from '../../helpers/auth';
import { getOrCreateSettings, Settings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import {
  fakeIntegrations,
  fakePlexTv,
  TEST_PLEX_SERVER,
  type FakeHandler,
  type FakePlexServer,
} from '../../helpers/fake-integrations';

import { completePlexLogin } from '@/lib/auth-login';

const ACCOUNT = { id: 'plex-user-1', username: 'plexuser', email: 'plex@example.com', thumb: 'thumb.jpg' };

function fakePlexTvWith(servers: FakePlexServer[]) {
  return fakeIntegrations(fakePlexTv({ account: ACCOUNT, servers }));
}

describe('completePlexLogin', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    fakePlexTvWith([{ name: 'Home', clientIdentifier: 'machine-1', owned: true, uri: TEST_PLEX_SERVER }]);
  });

  it('completes first-run setup with an owned Plex server and issues a session', async () => {
    const result = await completePlexLogin('first-run-token', {
      setupTmdbApiKey: 'tmdb-test-key-abcdefgh',
    });

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ username: 'plexuser', isAdmin: true });
    // The Plex server URL is an internal detail (spec #18 story 30); every login response,
    // including the one a Friend receives, must never carry it.
    expect(result.user).not.toHaveProperty('serverUrl');
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

  it('leaves no stale Admin flag when first-run setup fails because the owned server has no safe connection', async () => {
    fakePlexTvWith([
      { name: 'Home', clientIdentifier: 'machine-1', owned: true, uri: 'http://169.254.169.254:32400' },
    ]);

    const result = await completePlexLogin('first-run-token');

    expect(result).toMatchObject({ success: false, status: 403, code: 'SERVER_MISCONFIGURED' });
    expect(getTestCookie('decidarr_session')).toBeUndefined();

    const settings = await getOrCreateSettings();
    expect(settings.setupComplete).toBe(false);
    expect(settings.adminUserId).toBeUndefined();
    expect(await User.findOne({ plexUserId: 'plex-user-1' })).toBeNull();
  });

  it('rolls back the Admin flag when saving settings fails after the user was already saved as Admin', async () => {
    // Pre-create the settings document so completePlexLogin's own getOrCreateSettings() call
    // finds it rather than creating it, and the mocked rejection below only hits the later
    // save this test is reproducing.
    await getOrCreateSettings();
    const saveSpy = vi.spyOn(Settings.prototype, 'save').mockRejectedValueOnce(new Error('simulated db failure'));

    const result = await completePlexLogin('first-run-token');

    expect(result).toMatchObject({ success: false, status: 500, code: 'SERVER_MISCONFIGURED' });
    expect(getTestCookie('decidarr_session')).toBeUndefined();

    const settings = await getOrCreateSettings();
    expect(settings.setupComplete).toBe(false);
    expect(settings.adminUserId).toBeUndefined();

    const user = await User.findOne({ plexUserId: 'plex-user-1' });
    expect(user).not.toBeNull();
    expect(user?.isAdmin).toBe(false);
    expect(user?.isApproved).toBe(false);

    saveSpy.mockRestore();
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
    fakePlexTvWith([{ name: 'Shared Server', clientIdentifier: 'machine-1', owned: false, uri: TEST_PLEX_SERVER }]);

    const result = await completePlexLogin('approved-user-token');

    expect(result.success).toBe(true);
    expect(result.user).toMatchObject({ username: 'plexuser', isAdmin: false });
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const user = await User.findOne({ plexUserId: 'plex-user-1' });
    expect(user?.isAdmin).toBe(false);
    expect(user?.isApproved).toBe(true);
  });

  it("refuses a Friend when plex.tv gives no access token for this install's server", async () => {
    await seedConfiguredSettings();
    const settings = await getOrCreateSettings();
    settings.approvedPlexUserIds = ['plex-user-1'];
    await settings.save();
    const plexTv = fakePlexTv({
      account: ACCOUNT,
      servers: [{ clientIdentifier: 'machine-1', owned: false, uri: TEST_PLEX_SERVER }],
    });
    // A resource entry without an accessToken, as plex.tv lists a server whose share was revoked.
    fakeIntegrations(async (request) => {
      if (request.url.pathname !== '/api/v2/resources') return plexTv(request);
      const [server] = await (await plexTv(request)).json();
      return Response.json([{ ...server, accessToken: undefined }]);
    });

    const result = await completePlexLogin('friend-token');

    expect(result).toMatchObject({ success: false, status: 403, code: 'NO_SERVER_ACCESS' });
    expect(await User.findOne({ plexUserId: 'plex-user-1' })).toBeNull();
    expect(getTestCookie('decidarr_session')).toBeUndefined();
  });

  it('blocks configured users who have Plex access but are not approved', async () => {
    await seedConfiguredSettings();
    fakePlexTvWith([{ name: 'Shared Server', clientIdentifier: 'machine-1', owned: false, uri: TEST_PLEX_SERVER }]);

    const result = await completePlexLogin('unapproved-token');

    expect(result).toMatchObject({
      success: false,
      status: 403,
      error: 'Authentication failed',
      code: 'NOT_APPROVED',
    });
    expect(getTestCookie('decidarr_session')).toBeUndefined();
  });

  it.each([
    ['answers 5xx', () => new Response('down', { status: 502 })],
    [
      'cannot be reached',
      () => {
        throw new Error('connect ECONNREFUSED');
      },
    ],
  ])('returns a service unavailable result when plex.tv %s during sign-in', async (_case, answer) => {
    fakeIntegrations(answer as FakeHandler);

    const result = await completePlexLogin('token');

    expect(result).toMatchObject({ success: false, status: 503, code: 'PLEX_UNAVAILABLE' });
  });

  it('returns a service unavailable result when plex.tv fails during server discovery', async () => {
    const plexTv = fakePlexTv({ account: ACCOUNT });
    fakeIntegrations((request) =>
      request.url.pathname === '/api/v2/resources' ? new Response('down', { status: 503 }) : plexTv(request)
    );

    const result = await completePlexLogin('token');

    expect(result).toMatchObject({ success: false, status: 503, code: 'PLEX_UNAVAILABLE' });
    expect(getTestCookie('decidarr_session')).toBeUndefined();
  });

  it('rejects sign-in when plex.tv answers with a redirect', async () => {
    fakeIntegrations(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }));

    const result = await completePlexLogin('token');

    expect(result).toMatchObject({ success: false, status: 401, code: 'AUTH_FAILED' });
  });
});
