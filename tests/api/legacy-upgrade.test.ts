import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, getTestCookie } from '../helpers/cookies';
import {
  seedLegacyInstall,
  LEGACY_PLAINTEXT,
  LEGACY_ADMIN_PLEX_USER_ID,
  LEGACY_MACHINE_ID,
  type StoredSettings,
} from '../helpers/legacy-install-seed';
import { fakeIntegrations, fakePlex } from '../helpers/fake-integrations';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { getLegacyMasterKey, getOrCreateSettings } from '@/lib/models/Settings';
import { User, loadUserWithToken } from '@/lib/models/User';
import { completePlexLogin } from '@/lib/auth-login';
import { GET as statusGet } from '@/app/api/settings/status/route';
import { POST as restartPost } from '@/app/api/test/restart/route';

/** A real upgrade restarts the server: no cached connection, no migration run yet. */
function simulateRestart(): void {
  forgetConnectionForTests();
  resetMigrationStateForTests();
}

/** plex.tv signs the legacy admin in, and lists the legacy server as theirs. */
function fakeLegacyPlex() {
  return fakeIntegrations(fakePlex({ serverUri: 'http://192.168.1.10:32400', machineId: LEGACY_MACHINE_ID }));
}

describe('Upgrading a legacy install to DECIDARR_SECRET', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('migrates on the first request after restart, then serves status and login', async () => {
    // Before the upgrade: a running server without DECIDARR_SECRET, so the
    // master key is derived from MONGODB_URI.
    vi.stubEnv('DECIDARR_SECRET', '');
    await connectDB();
    const db = mongoose.connection.db!;
    await seedLegacyInstall(db, getLegacyMasterKey());

    // Upgrade: restart with DECIDARR_SECRET; the first request is the public status check.
    vi.stubEnv('DECIDARR_SECRET', 'upgrade-test-secret');
    simulateRestart();

    const res = await statusGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      setupComplete: true,
      hasPlexToken: true,
      hasPlexServer: true,
      hasTmdbKey: true,
    });

    const raw = await db.collection<StoredSettings>('settings').findOne({ _id: 'app-settings' });
    expect(raw?.secretsMigrationVersion).toBe(2);
    for (const field of ['jwtSecret', 'encryptionKey', 'plexToken', 'tmdbApiKey']) {
      expect(raw?.[field]).toMatch(/^v2:/);
    }

    const settings = await getOrCreateSettings();
    expect(settings.getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
    expect(settings.getDecryptedPlexToken()).toBe(LEGACY_PLAINTEXT.plexToken);

    const admin = await loadUserWithToken(settings.adminUserId!);
    expect(admin?.plexToken).toMatch(/^v2:/);
    expect(admin?.getDecryptedToken()).toBe(LEGACY_PLAINTEXT.plexToken);

    // The legacy admin signs in through Plex OAuth and keeps admin rights.
    const { sent } = fakeLegacyPlex();
    const login = await completePlexLogin('fresh-oauth-token');
    expect(login).toMatchObject({ success: true, user: { isAdmin: true } });
    expect(sent.map(({ url, headers }) => [url.pathname, headers.get('X-Plex-Token')])).toEqual([
      ['/api/v2/user', 'fresh-oauth-token'],
      ['/api/v2/resources', 'fresh-oauth-token'],
    ]);
    expect(getTestCookie('decidarr_session')).toBeTruthy();
    expect(await User.countDocuments({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID })).toBe(1);
  });
});

function restartRequest(secret?: string): Request {
  return new Request('http://localhost/api/test/restart', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'X-E2E-Reset-Secret': secret },
  });
}

describe('POST /api/test/restart', () => {
  beforeEach(async () => {
    await clearDatabase();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_MOCK_PLEX', 'true');
    vi.stubEnv('E2E_TEST_RESET_SECRET', 'seed-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 404 in production even with the correct secret', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await restartPost(restartRequest('seed-secret'))).status).toBe(404);
  });

  it('returns 404 when E2E_MOCK_PLEX is not true', async () => {
    vi.stubEnv('E2E_MOCK_PLEX', 'false');
    expect((await restartPost(restartRequest('seed-secret'))).status).toBe(404);
  });

  it('returns 403 without the matching reset secret', async () => {
    expect((await restartPost(restartRequest())).status).toBe(403);
    expect((await restartPost(restartRequest('wrong'))).status).toBe(403);
  });

  it('boots a legacy install seeded on a running server through the migration', async () => {
    vi.stubEnv('DECIDARR_SECRET', 'upgrade-test-secret');
    await connectDB();
    await seedLegacyInstall(mongoose.connection.db!, getLegacyMasterKey());

    const res = await restartPost(restartRequest('seed-secret'));
    expect(res.status).toBe(200);

    const raw = await mongoose.connection.db!
      .collection<StoredSettings>('settings')
      .findOne({ _id: 'app-settings' });
    expect(raw?.secretsMigrationVersion).toBe(2);
    expect(raw?.tmdbApiKey).toMatch(/^v2:/);
    expect((await getOrCreateSettings()).getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
  });
});

describe('Restarting with a different DECIDARR_SECRET', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the status API up and lets the admin sign in again', async () => {
    // A configured install under secret A.
    vi.stubEnv('DECIDARR_SECRET', 'secret-a');
    simulateRestart();
    await connectDB();
    const settings = await getOrCreateSettings();
    const admin = new User({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID, plexUsername: 'admin', isAdmin: true, isApproved: true });
    admin.setEncryptedToken('admin-plex-token', settings.getEncryptionKey());
    await admin.save();
    settings.plexServerUrl = 'http://192.168.1.10:32400';
    settings.plexMachineId = 'machine-a';
    settings.tmdbApiKey = 'tmdb-key-a';
    settings.adminUserId = admin._id;
    settings.setupComplete = true;
    await settings.save();

    // The operator restarts with secret B.
    vi.stubEnv('DECIDARR_SECRET', 'secret-b');
    simulateRestart();

    const before = await statusGet();
    expect(before.status).toBe(200);

    fakeIntegrations(fakePlex({ serverUri: 'http://192.168.1.10:32400', machineId: 'machine-a' }));
    const login = await completePlexLogin('fresh-oauth-token');
    expect(login).toMatchObject({ success: true, user: { isAdmin: true } });
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const after = await statusGet();
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ setupComplete: true, hasPlexToken: true });
  });
});
