import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { clearDatabase } from '../helpers/mongo';
import { clearTestCookies, getTestCookie } from '../helpers/cookies';
import {
  seedLegacyInstall,
  LEGACY_PLAINTEXT,
  LEGACY_ADMIN_PLEX_USER_ID,
  type StoredSettings,
} from '../helpers/legacy-install-seed';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { getLegacyMasterKey, isCurrentCiphertext } from '@/lib/secrets';
import { completePlexLogin } from '@/lib/auth-login';
import { GET as statusGet } from '@/app/api/settings/status/route';
import { GET as settingsGet } from '@/app/api/settings/route';
import { seedConfiguredSettings, seedTestUser } from '../helpers/auth';
import { POST as seedLegacyPost } from '@/app/api/test/seed-legacy/route';

/** A real upgrade restarts the server: no cached connection, no migration run yet. */
function simulateRestart(): void {
  forgetConnectionForTests();
  resetMigrationStateForTests();
}

describe('Upgrading a legacy install to DECIDARR_SECRET', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_MOCK_PLEX', 'true');
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
    expect(isCurrentCiphertext(raw!.plexToken!)).toBe(true);
    expect(isCurrentCiphertext(raw!.tmdbApiKey!)).toBe(true);

    const settings = await getOrCreateSettings();
    expect(settings.getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
    expect(settings.getDecryptedPlexToken()).toBe(LEGACY_PLAINTEXT.plexToken);

    const admin = await User.findById(settings.adminUserId!);
    expect(isCurrentCiphertext(admin!.plexToken)).toBe(true);
    expect(admin?.getDecryptedToken()).toBe(LEGACY_PLAINTEXT.plexToken);

    // The legacy admin signs in through the (mock) Plex OAuth flow and keeps admin rights.
    const login = await completePlexLogin('e2e-test-plex-token-valid');
    expect(login).toMatchObject({ success: true, user: { isAdmin: true } });
    expect(getTestCookie('decidarr_session')).toBeTruthy();
    expect(await User.countDocuments({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID })).toBe(1);
  });
});

function seedRequest(secret?: string): Request {
  return new Request('http://localhost/api/test/seed-legacy', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'X-E2E-Reset-Secret': secret },
  });
}

describe('POST /api/test/seed-legacy', () => {
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
    expect((await seedLegacyPost(seedRequest('seed-secret'))).status).toBe(404);
  });

  it('returns 404 when E2E_MOCK_PLEX is not true', async () => {
    vi.stubEnv('E2E_MOCK_PLEX', 'false');
    expect((await seedLegacyPost(seedRequest('seed-secret'))).status).toBe(404);
  });

  it('returns 403 without the matching reset secret', async () => {
    expect((await seedLegacyPost(seedRequest())).status).toBe(403);
    expect((await seedLegacyPost(seedRequest('wrong'))).status).toBe(403);
  });

  it('seeds a legacy install on a running server and boots it through the migration', async () => {
    vi.stubEnv('DECIDARR_SECRET', 'upgrade-test-secret');
    await connectDB();

    const res = await seedLegacyPost(seedRequest('seed-secret'));
    expect(res.status).toBe(200);

    const raw = await mongoose.connection.db!
      .collection<StoredSettings>('settings')
      .findOne({ _id: 'app-settings' });
    expect(isCurrentCiphertext(raw!.tmdbApiKey!)).toBe(true);
    expect((await getOrCreateSettings()).getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
  });
});

describe('Restarting with a different DECIDARR_SECRET', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_MOCK_PLEX', 'true');
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
    admin.setEncryptedToken('admin-plex-token');
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

    const login = await completePlexLogin('e2e-test-plex-token-valid');
    expect(login).toMatchObject({ success: true, user: { isAdmin: true } });
    expect(getTestCookie('decidarr_session')).toBeTruthy();

    const after = await statusGet();
    expect(after.status).toBe(200);
    expect(await after.json()).toMatchObject({ setupComplete: true, hasPlexToken: true });
  });

  it('keeps every stored secret, reports what needs re-entering, and reads them again under the original secret', async () => {
    const secretA = 'secret-a-0123456789abcdef0123456789abcdef';
    const secretB = 'secret-b-0123456789abcdef0123456789abcdef';

    // A configured install under secret A: admin, a Friend, and three integration keys.
    vi.stubEnv('DECIDARR_SECRET', secretA);
    simulateRestart();
    await connectDB();
    const configured = await seedConfiguredSettings({ tmdbApiKey: 'tmdb-key-a' });
    configured.tautulliApiKey = 'tautulli-key-a';
    configured.overseerrApiKey = 'overseerr-key-a';
    await configured.save();
    const admin = await seedTestUser({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID, plexUsername: 'admin' });
    await seedTestUser({ plexUserId: 'friend-1', plexUsername: 'friend', isAdmin: false });
    configured.adminUserId = admin._id;
    await configured.save();
    const before = await storedSecrets();

    // The operator restarts with a mistyped secret B.
    vi.stubEnv('DECIDARR_SECRET', secretB);
    simulateRestart();
    expect((await statusGet()).status).toBe(200);
    expect(await storedSecrets()).toEqual(before);

    // The admin signs in again (which re-enters their own Plex token) and is shown the rest.
    const login = await completePlexLogin('e2e-test-plex-token-valid');
    expect(login).toMatchObject({ success: true, user: { isAdmin: true } });
    const res = await settingsGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentialsNeedingReentry).toEqual(
      expect.arrayContaining([
        'Plex token (server settings)',
        'TMDB API key',
        'Tautulli API key',
        'Overseerr API key',
        'Plex sign-in for friend',
      ])
    );
    const afterSignIn = await storedSecrets();
    expect(afterSignIn.settings).toEqual(before.settings);
    expect(afterSignIn.users.find(([id]) => id === 'friend-1')).toEqual(
      before.users.find(([id]) => id === 'friend-1')
    );

    // Fixing the typo brings every untouched credential back.
    vi.stubEnv('DECIDARR_SECRET', secretA);
    simulateRestart();
    await connectDB();
    const restored = await getOrCreateSettings();
    expect(restored.getDecryptedTmdbKey()).toBe('tmdb-key-a');
    expect(restored.getDecryptedTautulliKey()).toBe('tautulli-key-a');
    expect(restored.getDecryptedOverseerrKey()).toBe('overseerr-key-a');
    expect(await readUserToken('friend-1')).toBe('test-plex-token-abcdefghijklmnop');
  });
});

describe('Restarting a legacy install with a changed MONGODB_URI', () => {
  const originalUri = process.env.MONGODB_URI!;

  /** A restart with different connection options reaches the same database. */
  async function restartWithUri(uri: string): Promise<void> {
    await mongoose.disconnect();
    vi.stubEnv('MONGODB_URI', uri);
    simulateRestart();
    await connectDB();
  }

  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_MOCK_PLEX', 'true');
  });

  afterEach(async () => {
    if (process.env.MONGODB_URI !== originalUri) {
      await restartWithUri(originalUri);
    }
    vi.unstubAllEnvs();
  });

  it('keeps the legacy secrets and upgrades them once the original URI is back', async () => {
    vi.stubEnv('DECIDARR_SECRET', '');
    await connectDB();
    const db = mongoose.connection.db!;
    await seedLegacyInstall(db, getLegacyMasterKey());
    const before = await storedSecrets();

    // The legacy master key came from MONGODB_URI, so new connection options break it.
    vi.stubEnv('DECIDARR_SECRET', 'upgrade-test-secret-0123456789abcdef');
    await restartWithUri(`${originalUri}?appName=decidarr-changed`);
    expect((await statusGet()).status).toBe(200);
    expect(await storedSecrets()).toEqual(before);

    await restartWithUri(originalUri);
    expect((await statusGet()).status).toBe(200);
    const settings = await getOrCreateSettings();
    expect(settings.getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
    expect(settings.getDecryptedPlexToken()).toBe(LEGACY_PLAINTEXT.plexToken);
    expect(await readUserToken(LEGACY_ADMIN_PLEX_USER_ID)).toBe(LEGACY_PLAINTEXT.plexToken);
  });
});

async function readUserToken(plexUserId: string): Promise<string> {
  return (await User.findOne({ plexUserId }))!.getDecryptedToken();
}

/** Raw stored ciphertext, read past the models so nothing decrypts or re-saves it. */
async function storedSecrets() {
  const db = mongoose.connection.db!;
  const settings = await db.collection<StoredSettings>('settings').findOne({ _id: 'app-settings' });
  const users = await db
    .collection('users')
    .find({}, { projection: { plexUserId: 1, plexToken: 1 } })
    .sort({ plexUserId: 1 })
    .toArray();
  return {
    settings: Object.fromEntries(
      ['plexToken', 'tmdbApiKey', 'tautulliApiKey', 'overseerrApiKey'].map((f) => [f, settings?.[f]])
    ),
    users: users.map((u) => [u.plexUserId as string, u.plexToken as string]),
  };
}
