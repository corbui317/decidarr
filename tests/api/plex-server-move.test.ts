import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies } from '../helpers/cookies';
import { createJsonRequest, seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { fakeIntegrations, fakePlexTv, plexSections, PLEX_TV, TEST_PLEX_SERVER } from '../helpers/fake-integrations';
import { completePlexLogin } from '@/lib/auth-login';
import { getOrCreateSettings } from '@/lib/models/Settings';

import { PUT as settingsPut } from '@/app/api/settings/route';
import { GET as sectionsGet } from '@/app/api/library/sections/route';

const ADMIN = { id: 'admin-1', username: 'admin', email: 'admin@example.com' };
const NEW_SERVER = 'http://192.168.1.99:32400';

/** plex.tv listing both the Admin's old and new server, and each server answering only its own token. */
function fakeAdminWithTwoServers() {
  const plexTv = fakePlexTv({
    account: ADMIN,
    servers: [
      { clientIdentifier: 'machine-1', owned: true, uri: TEST_PLEX_SERVER, accessToken: 'old-server-token' },
      { clientIdentifier: 'machine-2', owned: true, uri: NEW_SERVER, accessToken: 'new-server-token' },
    ],
  });
  const serverTokens: Record<string, string> = { [TEST_PLEX_SERVER]: 'old-server-token', [NEW_SERVER]: 'new-server-token' };
  return fakeIntegrations((request) => {
    if (request.url.origin === PLEX_TV) return plexTv(request);
    if (request.headers.get('X-Plex-Token') !== serverTokens[request.url.origin]) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (request.url.pathname === '/identity') {
      return Response.json({ MediaContainer: { machineIdentifier: request.url.origin === NEW_SERVER ? 'machine-2' : 'machine-1' } });
    }
    return plexSections([{ id: '1', title: 'Movies', type: 'movie' }]);
  });
}

describe('Moving the install to a different Plex server', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    await seedConfiguredSettings();
    const admin = await seedTestUser({ plexUserId: ADMIN.id, plexUsername: ADMIN.username, isAdmin: true });
    const settings = await getOrCreateSettings();
    settings.adminUserId = admin._id;
    await settings.save();
  });

  it('lets the Admin sign in again after saving the new server URL, and reach the new server', async () => {
    fakeAdminWithTwoServers();
    expect((await completePlexLogin('admin-account-token')).success).toBe(true);
    const saved = await settingsPut(
      createJsonRequest('http://localhost/api/settings', 'PUT', { plex: { serverUrl: NEW_SERVER } }) as never
    );
    expect(saved.status).toBe(200);

    // The old server's token does not open the new server, so the Admin is asked to sign in again ...
    const refused = await sectionsGet(new NextRequest('http://localhost/api/library/sections'));
    expect(refused.status).toBe(401);
    expect((await refused.json()).code).toBe('PLEX_SIGN_IN_REQUIRED');

    // ... and doing so gives them the new server's token.
    const again = await completePlexLogin('admin-account-token');
    expect(again).toMatchObject({ success: true });
    const res = await sectionsGet(new NextRequest('http://localhost/api/library/sections'));
    expect(res.status).toBe(200);
    expect((await getOrCreateSettings()).plexMachineId).toBe('machine-2');
  });
});
