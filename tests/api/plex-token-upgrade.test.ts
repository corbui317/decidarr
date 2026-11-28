import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, setTestCookie } from '../helpers/cookies';
import { createModernSessionToken, seedConfiguredSettings } from '../helpers/auth';
import {
  fakeIntegrations,
  fakePlexTv,
  PLEX_TV,
  TEST_PLEX_SERVER,
  type FakeHandler,
  type SentRequest,
} from '../helpers/fake-integrations';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { findCredentialsNeedingReentry, resetMigrationStateForTests } from '@/lib/migrate';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User, type IUser } from '@/lib/models/User';
import { WatchedItem } from '@/lib/models/WatchedItem';
import { decryptSecret, encryptSecret } from '@/lib/secrets';

import { GET as plexImageGet } from '@/app/api/plex/image/route';

const SECRET = 'plex-token-upgrade-test-0123456789abcdef';
const MACHINE_ID = 'machine-1';

const ADMIN_ACCOUNT_TOKEN = 'admin-account-token';
const FRIEND_ACCOUNT_TOKEN = 'friend-account-token';
const ADMIN_SERVER_TOKEN = 'admin-server-token';
const FRIEND_SERVER_TOKEN = 'friend-server-token';

function simulateRestart(): void {
  forgetConnectionForTests();
  resetMigrationStateForTests();
}

/** A user as an install from before per-server tokens stored them: one account token in `plexToken`. */
async function seedPreUpgradeUser(plexUserId: string, isAdmin: boolean, accountToken: string): Promise<IUser> {
  const user = new User({
    plexUserId,
    plexUsername: plexUserId,
    isAdmin,
    isApproved: true,
    sessionVersion: 0,
    preferences: { theme: 'light', selectedLibraries: ['1'] },
  });
  user.plexToken = encryptSecret(accountToken, { recordType: 'user', recordId: String(user._id), field: 'plexToken' });
  await user.save();
  await WatchedItem.create({ userId: user._id, plexId: `${plexUserId}-movie`, mediaType: 'movie', title: 'Movie', source: 'manual' });
  return user;
}

async function seedPreUpgradeInstall(): Promise<{ admin: IUser; friend: IUser }> {
  await connectDB();
  await seedConfiguredSettings();
  const admin = await seedPreUpgradeUser('admin-1', true, ADMIN_ACCOUNT_TOKEN);
  const friend = await seedPreUpgradeUser('friend-1', false, FRIEND_ACCOUNT_TOKEN);
  const settings = await getOrCreateSettings();
  settings.adminUserId = admin._id;
  settings.approvedPlexUserIds = ['friend-1'];
  // The legacy settings-level token, as v3 ciphertext.
  settings.plexToken = encryptSecret(ADMIN_ACCOUNT_TOKEN, {
    recordType: 'settings',
    recordId: 'app-settings',
    field: 'plexToken',
  });
  await settings.save();
  return { admin, friend };
}

/** plex.tv answering each account token with that account's resources, and a Plex server serving images. */
function fakePlexByToken(serversByToken: Record<string, { accessToken: string }[]>): { sent: SentRequest[] } {
  const server: FakeHandler = () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
  return fakeIntegrations((request) => {
    if (request.url.origin !== PLEX_TV) return server(request);
    const servers = serversByToken[request.headers.get('X-Plex-Token') ?? ''];
    if (!servers) return new Response('unauthorized', { status: 401 });
    return fakePlexTv({
      servers: servers.map(({ accessToken }) => ({ clientIdentifier: MACHINE_ID, owned: false, uri: TEST_PLEX_SERVER, accessToken })),
    })(request);
  });
}

async function rawUser(plexUserId: string): Promise<Record<string, unknown>> {
  return (await mongoose.connection.collection('users').findOne({ plexUserId }))!;
}

async function rawSettings(): Promise<Record<string, unknown>> {
  return (await mongoose.connection.collection('settings').findOne({ _id: 'app-settings' as never }))!;
}

/** Everything about the user except their Plex tokens and bookkeeping timestamps. */
async function userData(plexUserId: string): Promise<unknown> {
  const { plexToken: _a, plexServerToken: _b, plexServerMachineId: _e, plexAccountToken: _c, updatedAt: _d, ...rest } =
    await rawUser(plexUserId);
  const watched = await WatchedItem.find({ userId: rest._id }).lean();
  return { ...rest, watched: watched.map(({ plexId }) => plexId) };
}

function decryptUserField(raw: Record<string, unknown>, field: string): string {
  return decryptSecret(raw[field] as string, { recordType: 'user', recordId: String(raw._id), field });
}

async function requestImageAs(user: IUser): Promise<Response> {
  setTestCookie('decidarr_session', await createModernSessionToken(user));
  return plexImageGet(new NextRequest('http://localhost/api/plex/image?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2'));
}

describe('Upgrading stored Plex account tokens to per-server tokens', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DECIDARR_SECRET', SECRET);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("exchanges every account token, keeps the Admin's, discards the Friend's, and leaves their data alone", async () => {
    const { friend } = await seedPreUpgradeInstall();
    const before = { admin: await userData('admin-1'), friend: await userData('friend-1') };
    const { sent } = fakePlexByToken({
      [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }],
      [FRIEND_ACCOUNT_TOKEN]: [{ accessToken: FRIEND_SERVER_TOKEN }],
    });

    simulateRestart();
    await connectDB();

    const admin = await rawUser('admin-1');
    expect(admin.plexToken).toBeUndefined();
    expect(decryptUserField(admin, 'plexServerToken')).toBe(ADMIN_SERVER_TOKEN);
    expect(decryptUserField(admin, 'plexAccountToken')).toBe(ADMIN_ACCOUNT_TOKEN);
    const friendRaw = await rawUser('friend-1');
    expect(friendRaw.plexToken).toBeUndefined();
    expect(friendRaw.plexAccountToken).toBeUndefined();
    expect(decryptUserField(friendRaw, 'plexServerToken')).toBe(FRIEND_SERVER_TOKEN);
    expect([admin.plexServerMachineId, friendRaw.plexServerMachineId]).toEqual(['machine-1', 'machine-1']);
    expect({ admin: await userData('admin-1'), friend: await userData('friend-1') }).toEqual(before);
    expect(await rawSettings()).not.toHaveProperty('plexToken');
    expect(sent.filter(({ url }) => url.origin === PLEX_TV).map(({ url }) => url.pathname)).toEqual([
      '/api/v2/resources',
      '/api/v2/resources',
    ]);

    sent.length = 0;
    expect((await requestImageAs(friend)).status).toBe(200);
    expect(sent[0].headers.get('X-Plex-Token')).toBe(FRIEND_SERVER_TOKEN);
  });

  it('does nothing on a second run', async () => {
    await seedPreUpgradeInstall();
    fakePlexByToken({
      [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }],
      [FRIEND_ACCOUNT_TOKEN]: [{ accessToken: FRIEND_SERVER_TOKEN }],
    });
    simulateRestart();
    await connectDB();
    const first = { admin: await rawUser('admin-1'), friend: await rawUser('friend-1'), settings: await rawSettings() };

    const { sent } = fakePlexByToken({});
    simulateRestart();
    await connectDB();

    expect({ admin: await rawUser('admin-1'), friend: await rawUser('friend-1'), settings: await rawSettings() }).toEqual(first);
    expect(sent).toEqual([]);
  });

  it('finishes an interrupted run: users already exchanged are left as they are', async () => {
    const { admin } = await seedPreUpgradeInstall();
    // The earlier run got as far as the Admin before the process stopped.
    await User.updateOne(
      { _id: admin._id },
      {
        $unset: { plexToken: 1 },
        $set: {
          plexServerToken: encryptSecret(ADMIN_SERVER_TOKEN, { recordType: 'user', recordId: String(admin._id), field: 'plexServerToken' }),
          plexAccountToken: encryptSecret(ADMIN_ACCOUNT_TOKEN, { recordType: 'user', recordId: String(admin._id), field: 'plexAccountToken' }),
        },
      }
    );
    const adminBefore = await rawUser('admin-1');
    const { sent } = fakePlexByToken({ [FRIEND_ACCOUNT_TOKEN]: [{ accessToken: FRIEND_SERVER_TOKEN }] });

    simulateRestart();
    await connectDB();

    expect(await rawUser('admin-1')).toEqual(adminBefore);
    expect(decryptUserField(await rawUser('friend-1'), 'plexServerToken')).toBe(FRIEND_SERVER_TOKEN);
    expect(sent.map(({ headers }) => headers.get('X-Plex-Token'))).toEqual([FRIEND_ACCOUNT_TOKEN]);
  });

  it('keeps every token when plex.tv cannot be reached, asks users to sign in again, and retries at the next start', async () => {
    const { friend } = await seedPreUpgradeInstall();
    const before = { admin: await rawUser('admin-1'), friend: await rawUser('friend-1') };
    const { sent } = fakeIntegrations(() => new Response('down', { status: 503 }));

    simulateRestart();
    await connectDB();

    expect({ admin: await rawUser('admin-1'), friend: await rawUser('friend-1') }).toEqual(before);
    // One refused call is enough to stop trying until the next start.
    expect(sent).toHaveLength(1);
    const res = await requestImageAs(friend);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');

    fakePlexByToken({
      [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }],
      [FRIEND_ACCOUNT_TOKEN]: [{ accessToken: FRIEND_SERVER_TOKEN }],
    });
    simulateRestart();
    await connectDB();
    expect(decryptUserField(await rawUser('friend-1'), 'plexServerToken')).toBe(FRIEND_SERVER_TOKEN);
  });

  it.each([
    ['rate-limits the exchange (429)', () => new Response('slow down', { status: 429 })],
    ['times the request out (408)', () => new Response('timeout', { status: 408 })],
    ['sends an unreadable answer', () => new Response('<html>not json</html>', { status: 200 })],
  ])('keeps every stored token and retries at the next start when plex.tv %s', async (_label, answer) => {
    await seedPreUpgradeInstall();
    const before = { admin: await rawUser('admin-1'), friend: await rawUser('friend-1') };
    fakeIntegrations(answer);

    simulateRestart();
    await connectDB();

    expect({ admin: await rawUser('admin-1'), friend: await rawUser('friend-1') }).toEqual(before);

    fakePlexByToken({
      [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }],
      [FRIEND_ACCOUNT_TOKEN]: [{ accessToken: FRIEND_SERVER_TOKEN }],
    });
    simulateRestart();
    await connectDB();
    expect(decryptUserField(await rawUser('admin-1'), 'plexServerToken')).toBe(ADMIN_SERVER_TOKEN);
    expect(decryptUserField(await rawUser('friend-1'), 'plexServerToken')).toBe(FRIEND_SERVER_TOKEN);
  });

  it("drops only a Friend's account token that plex.tv refuses (401), and they sign in again", async () => {
    await seedPreUpgradeInstall();
    const before = await userData('friend-1');
    // The Friend's token is unknown to plex.tv, so it answers 401.
    fakePlexByToken({ [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }] });

    simulateRestart();
    await connectDB();

    const friendRaw = await rawUser('friend-1');
    expect(friendRaw.plexToken).toBeUndefined();
    expect(friendRaw.plexServerToken).toBeUndefined();
    expect(await userData('friend-1')).toEqual(before);
    expect(decryptUserField(await rawUser('admin-1'), 'plexServerToken')).toBe(ADMIN_SERVER_TOKEN);
  });

  it("drops a Friend's account token when plex.tv gives them no access to this server, and they sign in again", async () => {
    const { friend } = await seedPreUpgradeInstall();
    const before = await userData('friend-1');
    fakePlexByToken({ [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }], [FRIEND_ACCOUNT_TOKEN]: [] });

    simulateRestart();
    await connectDB();

    const friendRaw = await rawUser('friend-1');
    expect(friendRaw.plexToken).toBeUndefined();
    expect(friendRaw.plexServerToken).toBeUndefined();
    expect(friendRaw.plexAccountToken).toBeUndefined();
    expect(await userData('friend-1')).toEqual(before);
    const res = await requestImageAs(friend);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'PLEX_SIGN_IN_REQUIRED', error: expect.stringMatching(/sign in again/i) });
  });

  it('turns a single-user install into an Admin with a server token, learning the server identity first', async () => {
    // A v1 install set up by hand: one settings-level token, no Admin user, no machine id.
    await connectDB();
    const settings = await getOrCreateSettings();
    settings.plexToken = encryptSecret(ADMIN_ACCOUNT_TOKEN, { recordType: 'settings', recordId: 'app-settings', field: 'plexToken' });
    settings.plexServerUrl = TEST_PLEX_SERVER;
    settings.plexUsername = 'solo';
    settings.setupComplete = true;
    await settings.save();
    // A v1 install kept its spin history preferences on the settings document too.
    const legacySpinHistory = { enabled: false, retentionLimit: 7, storeFilterSnapshot: false };
    await mongoose.connection
      .collection('settings')
      .updateOne({ _id: 'app-settings' } as never, { $set: { spinHistoryPreferences: legacySpinHistory } });
    const plexTv = fakePlexTv({
      servers: [{ clientIdentifier: MACHINE_ID, owned: true, uri: TEST_PLEX_SERVER, accessToken: ADMIN_SERVER_TOKEN }],
    });
    const { sent } = fakeIntegrations((request) =>
      request.url.origin === PLEX_TV
        ? plexTv(request)
        : Response.json({ MediaContainer: { machineIdentifier: MACHINE_ID } })
    );

    simulateRestart();
    await connectDB();

    const upgraded = await getOrCreateSettings();
    expect(upgraded.plexMachineId).toBe(MACHINE_ID);
    expect(await rawSettings()).not.toHaveProperty('plexToken');
    const admin = await rawUser('migrated-solo');
    expect(String(upgraded.adminUserId)).toBe(String(admin._id));
    expect(admin.plexToken).toBeUndefined();
    expect(decryptUserField(admin, 'plexServerToken')).toBe(ADMIN_SERVER_TOKEN);
    expect(decryptUserField(admin, 'plexAccountToken')).toBe(ADMIN_ACCOUNT_TOKEN);
    expect((admin.preferences as { spinHistory?: unknown }).spinHistory).toEqual(legacySpinHistory);
    expect((await rawSettings()).spinHistoryPreferences).toEqual(legacySpinHistory);
    expect(sent.map(({ url, headers }) => [url.pathname, headers.get('X-Plex-Token')])).toEqual([
      ['/identity', ADMIN_ACCOUNT_TOKEN],
      ['/api/v2/resources', ADMIN_ACCOUNT_TOKEN],
    ]);
  });

  it('keeps a token it cannot decrypt exactly as stored and reports that user', async () => {
    await seedPreUpgradeInstall();
    const before = await rawUser('friend-1');
    await mongoose.connection
      .collection('users')
      .updateOne({ plexUserId: 'friend-1' }, { $set: { plexToken: (await rawUser('admin-1')).plexToken } });
    const copied = await rawUser('friend-1');
    fakePlexByToken({ [ADMIN_ACCOUNT_TOKEN]: [{ accessToken: ADMIN_SERVER_TOKEN }] });

    simulateRestart();
    await connectDB();

    expect(await rawUser('friend-1')).toEqual(copied);
    expect(copied.plexToken).not.toBe(before.plexToken);
    expect(await findCredentialsNeedingReentry()).toEqual(['Plex sign-in for friend-1']);
  });
});
