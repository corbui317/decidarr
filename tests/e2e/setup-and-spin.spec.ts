import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/plex-mocks';

test.describe('Setup flow', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('shows setup wizard on fresh install', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Welcome to Decidarr')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Get Started/i })).toBeVisible();
  });

  test('completes setup wizard and reaches dashboard', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await completeSetupWizard(page);
    await expect(page.getByText(/DECIDARR|SPIN/i).first()).toBeVisible({ timeout: 15000 });
  });
});
