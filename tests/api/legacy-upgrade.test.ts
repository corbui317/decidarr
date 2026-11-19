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
import { getLegacyMasterKey, getOrCreateSettings } from '@/lib/models/Settings';
import { User, loadUserWithToken } from '@/lib/models/User';
import { completePlexLogin } from '@/lib/auth-login';
import { GET as statusGet } from '@/app/api/settings/status/route';
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
    expect(raw?.secretsMigrationVersion).toBe(2);
    expect(raw?.tmdbApiKey).toMatch(/^v2:/);
    expect((await getOrCreateSettings()).getDecryptedTmdbKey()).toBe(LEGACY_PLAINTEXT.tmdbApiKey);
  });
});
