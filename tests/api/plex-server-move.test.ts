import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies } from '../helpers/cookies';
import {
  authenticateTestSession,
  createJsonRequest,
  seedConfiguredSettings,
  seedTestUser,
  TEST_ACCOUNT_TOKEN,
  TEST_SERVER_TOKEN,
} from '../helpers/auth';
import {
  fakeIntegrations,
  fakePlexTv,
  plexSections,
  PLEX_TV,
  TEST_PLEX_SERVER,
  type FakeHandler,
  type FakePlexServer,
} from '../helpers/fake-integrations';
import { completePlexLogin } from '@/lib/auth-login';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User, type IUser } from '@/lib/models/User';

import { PUT as settingsPut } from '@/app/api/settings/route';
import { POST as testPlexPost } from '@/app/api/settings/test-plex/route';
import { GET as sectionsGet } from '@/app/api/library/sections/route';

const ADMIN = { id: 'admin-1', username: 'admin', email: 'admin@example.com' };
const FRIEND = { id: 'friend-1', username: 'friend', email: 'friend@example.com' };
const FRIEND_ACCOUNT_TOKEN = 'friend-account-token';
const FRIEND_OLD_TOKEN = 'friend-old-server-token';
const NEW_SERVER = 'http://192.168.1.99:32400';
const SAME_SERVER_NEW_ADDRESS = 'http://192.168.1.11:32400';
const OLD_TOKENS = [TEST_SERVER_TOKEN, FRIEND_OLD_TOKEN];

const oldServer: FakePlexServer = { clientIdentifier: 'machine-1', owned: true, uri: TEST_PLEX_SERVER, accessToken: TEST_SERVER_TOKEN };
const newServer: FakePlexServer = { clientIdentifier: 'machine-2', owned: true, uri: NEW_SERVER, accessToken: 'new-server-token' };

/** Each Plex server answers /identity to anyone, as Plex does, and everything else only for its own tokens. */
const SERVERS: Record<string, { machineId: string; tokens: string[] }> = {
  [TEST_PLEX_SERVER]: { machineId: 'machine-1', tokens: [TEST_SERVER_TOKEN, FRIEND_OLD_TOKEN] },
  [SAME_SERVER_NEW_ADDRESS]: { machineId: 'machine-1', tokens: [TEST_SERVER_TOKEN, FRIEND_OLD_TOKEN] },
  [NEW_SERVER]: { machineId: 'machine-2', tokens: ['new-server-token'] },
};

/**
 * plex.tv answering the Admin's account token with both their servers and the Friend's with
 * only the old one, unless `plexTv` overrides it; plus the servers above.
 */
function fakeTwoServers(plexTv?: FakeHandler) {
  const admin = fakePlexTv({ account: ADMIN, servers: [oldServer, newServer] });
  const friend = fakePlexTv({
    account: FRIEND,
    servers: [{ clientIdentifier: 'machine-1', owned: false, uri: TEST_PLEX_SERVER, accessToken: FRIEND_OLD_TOKEN }],
  });
  return fakeIntegrations((request) => {
    if (request.url.origin === PLEX_TV) {
      if (plexTv) return plexTv(request);
      return request.headers.get('X-Plex-Token') === FRIEND_ACCOUNT_TOKEN ? friend(request) : admin(request);
    }
    const server = SERVERS[request.url.origin];
    if (!server) throw new Error(`connect ECONNREFUSED ${request.url.origin}`);
    if (request.url.pathname === '/identity') {
      return Response.json({ MediaContainer: { machineIdentifier: server.machineId } });
    }
    if (!server.tokens.includes(request.headers.get('X-Plex-Token') ?? '')) {
      return new Response('Unauthorized', { status: 401 });
    }
    return plexSections([{ id: '1', title: 'Movies', type: 'movie' }]);
  });
}

function oldTokensSentTo(sent: { url: URL; headers: Headers }[], origin: string): string[] {
  return sent
    .filter((request) => request.url.origin === origin)
    .map((request) => request.headers.get('X-Plex-Token') ?? '')
    .filter((token) => OLD_TOKENS.includes(token));
}

async function saveServerUrl(serverUrl: string) {
  return settingsPut(createJsonRequest('http://localhost/api/settings', 'PUT', { plex: { serverUrl } }) as never);
}

async function testServerUrl(plexServerUrl: string) {
  return testPlexPost(createJsonRequest('http://localhost/api/settings/test-plex', 'POST', { plexServerUrl }) as never);
}

async function sections() {
  return sectionsGet(new NextRequest('http://localhost/api/library/sections'));
}

describe('Moving the install to a different Plex server', () => {
  let admin: IUser;
  let friend: IUser;

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    admin = await seedTestUser({ plexUserId: ADMIN.id, plexUsername: ADMIN.username, isAdmin: true });
    friend = await seedTestUser({ plexUserId: FRIEND.id, plexUsername: FRIEND.username, isAdmin: false });
    friend.setPlexTokens({ serverToken: FRIEND_OLD_TOKEN, accountToken: null, machineId: 'machine-1' });
    await friend.save();
    const settings = await getOrCreateSettings();
    settings.adminUserId = admin._id;
    settings.approvedPlexUserIds = [FRIEND.id];
    await settings.save();
    await authenticateTestSession({ user: admin });
  });

  it("switches to the new server with the Admin's new token, and no old-server token ever reaches it", async () => {
    const { sent } = fakeTwoServers();

    const tested = await testServerUrl(NEW_SERVER);
    expect(await tested.json()).toEqual({ valid: true, differentServer: true });

    const saved = await saveServerUrl(NEW_SERVER);
    expect(saved.status).toBe(200);
    const settings = await getOrCreateSettings();
    expect(settings.plexServerUrl).toBe(NEW_SERVER);
    expect(settings.plexMachineId).toBe('machine-2');

    const res = await sections();
    expect(res.status).toBe(200);

    // The Friend's old-server token is deleted, and they are asked to sign in again.
    const storedFriend = await User.findById(friend._id);
    expect(storedFriend?.plexServerToken).toBeUndefined();
    await authenticateTestSession({ user: friend });
    const refused = await sections();
    expect(refused.status).toBe(401);
    expect((await refused.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');

    expect(sent.some((request) => request.url.origin === NEW_SERVER)).toBe(true);
    expect(oldTokensSentTo(sent, NEW_SERVER)).toEqual([]);
  });

  it('tells a Friend without access to the new server so when they sign in again', async () => {
    const { sent } = fakeTwoServers();
    expect((await saveServerUrl(NEW_SERVER)).status).toBe(200);

    const again = await completePlexLogin(FRIEND_ACCOUNT_TOKEN);
    expect(again).toMatchObject({ success: false, code: 'NO_SERVER_ACCESS', status: 403 });
    expect(oldTokensSentTo(sent, NEW_SERVER)).toEqual([]);
  });

  it('never sends a token stored for the old server to the new one, even one stored after the move', async () => {
    const { sent } = fakeTwoServers();
    expect((await saveServerUrl(NEW_SERVER)).status).toBe(200);

    // A sign-in that raced the move stored a token for the old server.
    const raced = await User.findById(friend._id);
    raced!.setPlexTokens({ serverToken: FRIEND_OLD_TOKEN, accountToken: null, machineId: 'machine-1' });
    await raced!.save();

    await authenticateTestSession({ user: raced! });
    const res = await sections();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');
    expect(oldTokensSentTo(sent, NEW_SERVER)).toEqual([]);
  });

  it("keeps everyone's tokens when the new URL reaches the same server", async () => {
    const { sent } = fakeTwoServers();

    const tested = await testServerUrl(SAME_SERVER_NEW_ADDRESS);
    expect(await tested.json()).toEqual({ valid: true, libraryCount: 1 });
    expect((await saveServerUrl(SAME_SERVER_NEW_ADDRESS)).status).toBe(200);

    const settings = await getOrCreateSettings();
    expect(settings.plexServerUrl).toBe(SAME_SERVER_NEW_ADDRESS);
    expect(settings.plexMachineId).toBe('machine-1');
    expect((await User.findById(friend._id))?.getServerToken('machine-1')).toBe(FRIEND_OLD_TOKEN);
    expect((await sections()).status).toBe(200);
    expect(sent.some((request) => request.url.origin === PLEX_TV)).toBe(false);
  });

  it.each([
    {
      name: 'plex.tv is unavailable',
      url: NEW_SERVER,
      plexTv: () => new Response('down', { status: 503 }),
      status: 503,
      code: 'INTEGRATION_UNAVAILABLE',
    },
    {
      name: 'plex.tv refuses the Admin account token',
      url: NEW_SERVER,
      plexTv: () => new Response('Unauthorized', { status: 401 }),
      status: 401,
      code: 'PLEX_SIGN_IN_REQUIRED',
    },
    {
      name: "the Admin's account has no access to the new server",
      url: NEW_SERVER,
      plexTv: fakePlexTv({ account: ADMIN, servers: [oldServer] }),
      status: 400,
      code: 'VALIDATION_FAILED',
    },
    {
      name: 'no Plex server answers at the URL',
      url: 'http://192.168.1.250:32400',
      plexTv: undefined,
      status: 400,
      code: 'VALIDATION_FAILED',
    },
  ])('changes nothing when $name', async ({ url, plexTv, status, code }) => {
    const { sent } = fakeTwoServers(plexTv);

    const res = await saveServerUrl(url);
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);

    const settings = await getOrCreateSettings();
    expect(settings.plexServerUrl).toBe(TEST_PLEX_SERVER);
    expect(settings.plexMachineId).toBe('machine-1');
    const storedAdmin = await User.findById(admin._id);
    expect(storedAdmin?.getServerToken('machine-1')).toBe(TEST_SERVER_TOKEN);
    expect(storedAdmin?.getAccountToken()).toBe(TEST_ACCOUNT_TOKEN);
    expect((await User.findById(friend._id))?.getServerToken('machine-1')).toBe(FRIEND_OLD_TOKEN);
    expect((await sections()).status).toBe(200);
    expect(oldTokensSentTo(sent, url)).toEqual([]);
  });
});
