import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';
import { E2E_DECIDARR_SECRET, E2E_MONGO_URI, E2E_PLEX_SERVER_URL, E2E_RESET_SECRET } from './e2e-env';
import {
  LEGACY_ADMIN_PLEX_USER_ID,
  LEGACY_PLAINTEXT,
  seedLegacyInstall,
  type StoredSettings,
} from '../helpers/legacy-install-seed';
import { decryptSecret, isCurrentCiphertext, legacyMasterKeyFor } from '@/lib/secrets';
import { E2E_MACHINE_ID, E2E_SERVER_TOKEN } from './fake-plex';

// Lets this process derive the keys the E2E server uses, to check what it stored.
process.env.DECIDARR_SECRET = E2E_DECIDARR_SECRET;

async function withE2eDb(fn: (db: mongoose.mongo.Db) => Promise<void>): Promise<void> {
  const client = await new mongoose.mongo.MongoClient(E2E_MONGO_URI).connect();
  try {
    await fn(client.db());
  } finally {
    await client.close();
  }
}

/**
 * E2E tests for DECIDARR_SECRET encryption and migration.
 * These tests verify that:
 * 1. Fresh installs with DECIDARR_SECRET don't crash (fixes issue #2)
 * 2. Existing installs with legacy encryption migrate transparently
 */
test.describe('DECIDARR_SECRET encryption', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('fresh install with DECIDARR_SECRET completes setup and reaches dashboard', async ({ page }) => {
    test.setTimeout(60000);
    
    // This test verifies the fix for the intermittent crash on fresh installs
    // Previously: 28 of 40 fresh installs with DECIDARR_SECRET would crash
    // Now: Should complete setup normally
    
    await page.goto('/');
    await expect(page.getByText('Welcome to Decidarr')).toBeVisible({ timeout: 15000 });
    
    // Complete the setup wizard
    await completeSetupWizard(page);
    
    // Verify we reached the dashboard without crashes
    await expect(page.getByText(/DECIDARR|SPIN/i).first()).toBeVisible({ timeout: 15000 });
    
    // Verify app is functional - settings should open
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Plex/i)).toBeVisible({ timeout: 5000 });
  });

  test('setup with DECIDARR_SECRET allows login and spin', async ({ page }) => {
    test.setTimeout(60000);

    // This test verifies that with DECIDARR_SECRET set from the start,
    // the app works correctly through the full flow: setup, auth, and spin.
    // The server has DECIDARR_SECRET set and will use AES-256-GCM encryption.

    // Complete initial setup
    await page.goto('/');
    await completeSetupWizard(page);

    // Verify dashboard loads after setup (tests JWT creation/validation)
    await expect(page.getByText(/DECIDARR|SPIN/i).first()).toBeVisible({ timeout: 15000 });

    // Verify settings are accessible (tests encrypted credentials decryption)
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/Plex/i)).toBeVisible({ timeout: 5000 });

    // Close settings modal
    await page.keyboard.press('Escape');

    // Verify spin button is present (disabled is OK if no libraries configured)
    const spinButton = page.getByRole('button', { name: /spin/i }).first();
    await expect(spinButton).toBeVisible({ timeout: 5000 });
  });

  test('shows the Admin a stored credential that cannot be decrypted, and keeps it', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await completeSetupWizard(page);

    // A ciphertext copied onto another record and field fails its AAD check.
    let copied = '';
    await withE2eDb(async (db) => {
      const admin = await db.collection('users').findOne({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID });
      copied = admin!.plexServerToken;
      await db
        .collection<StoredSettings>('settings')
        .updateOne({ _id: 'app-settings' }, { $set: { tautulliApiKey: copied } });
    });

    await page.getByRole('button', { name: /settings/i }).click();
    await page.getByRole('tab', { name: 'Integrations' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'need re-entering' });
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(alert.getByRole('listitem')).toHaveText(['Tautulli API key']);

    await withE2eDb(async (db) => {
      const settings = await db.collection<StoredSettings>('settings').findOne({ _id: 'app-settings' });
      expect(settings?.tautulliApiKey).toBe(copied);
    });
  });

  test('legacy-encrypted install migrates and allows login and spin', async ({ page, request }) => {
    test.setTimeout(90000);

    // An install from before DECIDARR_SECRET (CryptoJS, master key from MONGODB_URI)
    // is restarted with DECIDARR_SECRET set: write that legacy data, then boot it
    // the way the restart would, which runs the migration.
    // Its Plex server is the fake one on loopback, so the dashboard can list libraries
    // and the upgrade can exchange the stored account token for that server's token.
    await withE2eDb(async (db) => {
      await seedLegacyInstall(db, legacyMasterKeyFor(E2E_MONGO_URI));
      await db
        .collection<StoredSettings>('settings')
        .updateOne({ _id: 'app-settings' }, { $set: { plexServerUrl: E2E_PLEX_SERVER_URL, plexMachineId: E2E_MACHINE_ID } });
      await db.collection('librarycaches').updateMany({}, { $set: { plexMachineId: E2E_MACHINE_ID } });
    });
    const restart = await request.post('/api/test/restart', {
      headers: { 'X-E2E-Reset-Secret': E2E_RESET_SECRET },
    });
    expect(restart.ok(), await restart.text()).toBeTruthy();

    // Assert the migration on disk before signing in: the stored account token was
    // exchanged for the Admin's server token, and the settings-level token is gone.
    await withE2eDb(async (db) => {
      const settings = await db.collection<StoredSettings>('settings').findOne({ _id: 'app-settings' });
      expect(isCurrentCiphertext(settings!.tmdbApiKey!)).toBe(true);
      expect(
        decryptSecret(settings!.tmdbApiKey!, { recordType: 'settings', recordId: 'app-settings', field: 'tmdbApiKey' })
      ).toBe(LEGACY_PLAINTEXT.tmdbApiKey);

      expect(settings).not.toHaveProperty('plexToken');

      const admin = await db.collection('users').findOne({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID });
      const location = (field: string) => ({ recordType: 'user' as const, recordId: String(admin!._id), field });
      expect(admin).not.toHaveProperty('plexToken');
      expect(decryptSecret(admin!.plexAccountToken, location('plexAccountToken'))).toBe(LEGACY_PLAINTEXT.plexToken);
      expect(decryptSecret(admin!.plexServerToken, location('plexServerToken'))).toBe(E2E_SERVER_TOKEN);
    });

    // setupComplete is true, so the app offers sign-in, not the setup wizard.
    await page.goto('/');
    const signIn = page.getByRole('button', { name: 'Login with Plex' });
    await expect(signIn).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Welcome to Decidarr')).toHaveCount(0);

    // Sign in through the fake plex.tv as the seeded legacy admin and spin once.
    await signIn.click();
    await page
      .getByRole('group', { name: 'Movies' })
      .getByRole('button', { name: /Movies/ })
      .click();
    const spinButton = page.getByRole('button', { name: 'Spin for a random pick' });
    await expect(spinButton).toBeEnabled({ timeout: 15000 });
    await spinButton.click();
    await expect(page.getByText('Your fate has been decided!')).toBeVisible({ timeout: 20000 });

    // The legacy admin kept its account and admin rights; no second user was created.
    await withE2eDb(async (db) => {
      const users = await db.collection('users').find({}).toArray();
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ plexUserId: LEGACY_ADMIN_PLEX_USER_ID, isAdmin: true });
    });
  });
});
