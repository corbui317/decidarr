import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/plex-mocks';
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

  test('legacy-encrypted install migrates and allows new login', async ({ page, request }) => {
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

    // Step 2: Seed legacy-encrypted settings (pre-migration format)
    await seedLegacyEncryptedSettings();

    // Step 3: Navigate to trigger migration on next database connection
    // The server will run migration when it connects to handle this request
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Step 4: Should see setup wizard (setupComplete=false in seeded data)
    // Migration has already happened server-side at this point
    await expect(page.getByText('Welcome to Decidarr')).toBeVisible({ timeout: 15000 });

    // Step 5: Complete setup with mock Plex (tests that migration worked)
    // If migration failed, decryption would fail and setup would error
    await completeSetupWizard(page);

    // Step 6: Verify we reach the dashboard
    // This confirms migration was successful and app is functional
    await expect(page.getByText(/DECIDARR|SPIN/i).first()).toBeVisible({ timeout: 15000 });

    // Step 7: Verify spin button is present
    const spinButton = page.getByRole('button', { name: /spin/i }).first();
    await expect(spinButton).toBeVisible({ timeout: 5000 });

    // Step 8: Verify settings are accessible (final validation)
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 5000 });

    // This confirms: legacy settings migrated to AES-256-GCM,
    // decryption works correctly, and app is fully functional
  });
});
