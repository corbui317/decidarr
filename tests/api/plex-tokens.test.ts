import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, getTestCookie } from '../helpers/cookies';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import {
  fakeIntegrations,
  fakePlexTv,
  PLEX_TV,
  TEST_PLEX_SERVER,
  type FakeHandler,
  type SentRequest,
} from '../helpers/fake-integrations';
import { decryptSecret } from '@/lib/secrets';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { completePlexLogin } from '@/lib/auth-login';

import { GET as plexImageGet } from '@/app/api/plex/image/route';

const FRIEND = { id: 'friend-1', username: 'friend', email: 'friend@example.com' };
const ADMIN = { id: 'admin-1', username: 'admin', email: 'admin@example.com' };

const FRIEND_ACCOUNT_TOKEN = 'friend-plex-tv-account-token';
const FRIEND_SERVER_TOKEN = 'friend-server-access-token';
const ADMIN_ACCOUNT_TOKEN = 'admin-plex-tv-account-token';
const ADMIN_SERVER_TOKEN = 'admin-server-access-token';

const IMAGE = new Uint8Array([1, 2, 3]);

/** plex.tv signing in `account`, which reaches this install's server with `serverToken`, plus that server. */
function fakeSignIn(account: typeof FRIEND, owned: boolean, serverToken: string): { sent: SentRequest[] } {
  const plexTv = fakePlexTv({
    account,
    servers: [{ clientIdentifier: 'machine-1', owned, uri: TEST_PLEX_SERVER, accessToken: serverToken }],
  });
  const server: FakeHandler = () =>
    new Response(IMAGE, { status: 200, headers: { 'content-type': 'image/png' } });
  return fakeIntegrations((request) => (request.url.origin === PLEX_TV ? plexTv(request) : server(request)));
}

/** Every stored string on the user's record that decrypts, by field. */
async function decryptableUserFields(plexUserId: string): Promise<Record<string, string>> {
  const raw = await mongoose.connection.collection('users').findOne({ plexUserId });
  const fields: Record<string, string> = {};
  for (const [field, value] of Object.entries(raw ?? {})) {
    if (typeof value !== 'string') continue;
    try {
      fields[field] = decryptSecret(value, { recordType: 'user', recordId: String(raw!._id), field });
    } catch {
      // Not a stored secret.
    }
  }
  return fields;
}

/** Requests a poster with the session cookie that sign-in just set. */
async function requestImageWithSessionCookie(): Promise<Response> {
  expect(getTestCookie('decidarr_session')).toBeTruthy();
  return plexImageGet(new NextRequest('http://localhost/api/plex/image?path=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2'));
}

async function seedInstallWithAdmin(): Promise<void> {
  await seedConfiguredSettings();
  const admin = await seedTestUser({ plexUserId: ADMIN.id, plexUsername: ADMIN.username, isAdmin: true });
  const settings = await getOrCreateSettings();
  settings.adminUserId = admin._id;
  settings.approvedPlexUserIds = [FRIEND.id];
  await settings.save();
}

describe('Plex tokens', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
  });

  it('keeps no plex.tv account token for a Friend after sign-in, only their server token', async () => {
    await seedInstallWithAdmin();
    fakeSignIn(FRIEND, false, FRIEND_SERVER_TOKEN);

    const result = await completePlexLogin(FRIEND_ACCOUNT_TOKEN);

    expect(result.success).toBe(true);
    const stored = Object.values(await decryptableUserFields(FRIEND.id));
    expect(stored).not.toContain(FRIEND_ACCOUNT_TOKEN);
    expect(stored).toContain(FRIEND_SERVER_TOKEN);
  });

  it("sends a Friend's server token, never their account token, on Plex server requests", async () => {
    await seedInstallWithAdmin();
    const { sent } = fakeSignIn(FRIEND, false, FRIEND_SERVER_TOKEN);
    await completePlexLogin(FRIEND_ACCOUNT_TOKEN);
    sent.length = 0;

    const res = await requestImageWithSessionCookie();

    expect(res.status).toBe(200);
    const serverRequests = sent.filter(({ url }) => url.origin === TEST_PLEX_SERVER);
    expect(serverRequests).toHaveLength(1);
    expect(serverRequests[0].headers.get('X-Plex-Token')).toBe(FRIEND_SERVER_TOKEN);
  });

  it("keeps the Admin's account token and uses the Admin's server token for the image proxy", async () => {
    await seedInstallWithAdmin();
    const { sent } = fakeSignIn(ADMIN, true, ADMIN_SERVER_TOKEN);

    await completePlexLogin(ADMIN_ACCOUNT_TOKEN);
    sent.length = 0;
    const res = await requestImageWithSessionCookie();

    expect(res.status).toBe(200);
    expect(sent[0].headers.get('X-Plex-Token')).toBe(ADMIN_SERVER_TOKEN);
    const stored = Object.values(await decryptableUserFields(ADMIN.id));
    expect(stored).toEqual(expect.arrayContaining([ADMIN_ACCOUNT_TOKEN, ADMIN_SERVER_TOKEN]));
  });

  it('identifies every plex.tv call with a client identifier generated and persisted for this install', async () => {
    await seedInstallWithAdmin();
    const { sent } = fakeSignIn(FRIEND, false, FRIEND_SERVER_TOKEN);

    await completePlexLogin(FRIEND_ACCOUNT_TOKEN);

    const stored = await mongoose.connection.collection('settings').findOne({ _id: 'app-settings' as never });
    const clientId = stored?.plexClientId;
    expect(typeof clientId).toBe('string');
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
    const plexTvRequests = sent.filter(({ url }) => url.origin === PLEX_TV);
    expect(plexTvRequests.length).toBeGreaterThan(0);
    for (const request of plexTvRequests) {
      expect(request.headers.get('X-Plex-Client-Identifier')).toBe(clientId);
    }
  });

  it('gives a Friend whose server token stopped working a clean sign-in-again error', async () => {
    await seedInstallWithAdmin();
    fakeSignIn(FRIEND, false, FRIEND_SERVER_TOKEN);
    await completePlexLogin(FRIEND_ACCOUNT_TOKEN);
    fakeIntegrations(() => new Response('Unauthorized', { status: 401 }));

    const res = await requestImageWithSessionCookie();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe('PLEX_SIGN_IN_REQUIRED');
    expect(body.error).toMatch(/sign in again/i);
  });
});
