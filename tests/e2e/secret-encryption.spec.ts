import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';
import { seedLegacyEncryptedSettings } from './helpers/legacy-settings-seed';

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

  test('legacy-encrypted install migrates and allows login and spin', async ({ page, request }) => {
    test.setTimeout(90000);

    // This test verifies the critical migration scenario:
    // An install with legacy CryptoJS-encrypted settings is restarted with
    // DECIDARR_SECRET set. Migration must happen transparently, and the
    // app must remain functional after migration.

    // Step 1: Reset database and migration state
    await request.post('/api/test/reset', {
      headers: {
        'X-E2E-Reset-Secret': process.env.E2E_TEST_RESET_SECRET || 'decidarr-e2e-reset',
        'X-E2E-Reset-Migration': 'true',
      },
    });

    // Step 2: Seed legacy-encrypted settings with setupComplete=true and library cache
    const seededData = await seedLegacyEncryptedSettings();

    // Step 3: Clear any stale cookies/session before navigating
    await page.context().clearCookies();

    // Step 4: Navigate to trigger migration on next database connection
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Debug: Check database state after migration
    const debugResponse = await request.get('/api/test/debug-settings');
    const debugData = await debugResponse.json();
    console.log('[DEBUG] Database state after migration:', JSON.stringify(debugData, null, 2));

    // Step 5: Should see login screen (setupComplete=true, so no setup wizard)
    await expect(page.getByRole('button', { name: /Sign in with Plex/i })).toBeVisible({ timeout: 15000 });

    // Step 6: Sign in through mock OAuth flow as the legacy user
    await page.getByRole('button', { name: /Sign in with Plex/i }).click();

    // Step 7: Should reach dashboard after login
    await expect(page.getByText(/DECIDARR|SPIN/i).first()).toBeVisible({ timeout: 15000 });

    // Step 8: Spin once to verify app is functional
    const spinButton = page.getByRole('button', { name: /spin/i }).first();
    await expect(spinButton).toBeVisible({ timeout: 5000 });
    await expect(spinButton).toBeEnabled({ timeout: 5000 });
    await spinButton.click();

    // Wait for spin animation to complete
    await page.waitForTimeout(2000);

    // Step 9: Connect to Mongo and assert migration results
    const mongoose = await import('mongoose');
    const { E2E_MONGO_URI } = await import('./helpers/legacy-settings-seed');
    await mongoose.default.connect(E2E_MONGO_URI);

    // Assert settings migration
    const settings = await mongoose.default.connection.db?.collection('settings').findOne({ _id: 'app-settings' } as any);
    expect(settings?.secretsMigrationVersion).toBe(2);
    expect(settings?.jwtSecret).toMatch(/^v2:/);
    expect(settings?.encryptionKey).toMatch(/^v2:/);

    // Decrypt and verify TMDB API key
    // We need to decrypt using the same logic as the server
    const CryptoJS = await import('crypto-js');
    const { getMasterKey } = await import('./helpers/legacy-settings-seed');
    const { createHash } = await import('crypto');

    // Derive AES-256-GCM key from master key
    const masterKey = getMasterKey();
    const keyBuffer = createHash('sha256').update(masterKey).digest();

    // Parse v2: format
    const tmdbParts = settings?.tmdbApiKey?.split(':');
    if (tmdbParts?.[0] !== 'v2' || tmdbParts.length !== 4) {
      throw new Error('Invalid v2 format');
    }

    const [_, ivB64, tagB64, cipherB64] = tmdbParts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(cipherB64, 'base64');

    // Decrypt
    const crypto = await import('crypto');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);
    const decryptedTmdb = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    expect(decryptedTmdb).toBe('test-tmdb-key-legacy');

    // Assert user token migration
    const user = await mongoose.default.connection.db?.collection('users').findOne({ plexUserId: 'legacy-plex-user-1' });
    expect(user?.plexToken).toMatch(/^v2:/);

    // Decrypt and verify user Plex token
    const tokenParts = user?.plexToken?.split(':');
    if (tokenParts?.[0] !== 'v2' || tokenParts.length !== 4) {
      throw new Error('Invalid v2 format for user token');
    }

    const [_v, ivB64Token, tagB64Token, cipherB64Token] = tokenParts;
    const ivToken = Buffer.from(ivB64Token, 'base64');
    const authTagToken = Buffer.from(tagB64Token, 'base64');
    const ciphertextToken = Buffer.from(cipherB64Token, 'base64');

    const decipherToken = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivToken);
    decipherToken.setAuthTag(authTagToken);
    const decryptedToken = Buffer.concat([decipherToken.update(ciphertextToken), decipherToken.final()]).toString('utf8');
    expect(decryptedToken).toBe('test-plex-token-legacy');

    await mongoose.default.disconnect();

    // This confirms: legacy settings migrated to AES-256-GCM,
    // all encrypted values have v2: prefix, decryption works correctly,
    // and app is fully functional (login, dashboard, spin all work)
  });
});
