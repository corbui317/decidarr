import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';

test.describe('Settings integrations', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('saves Tautulli and Overseerr settings with mocked connection checks', async ({ page }) => {
    test.setTimeout(90000);

    await page.route('**/api/tautulli/test', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          users: [{ id: 1, username: 'e2euser', friendlyName: 'E2E User' }],
        }),
      });
    });
    await page.route('**/api/overseerr/test', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, version: '1.0.0' }),
      });
    });

    await page.goto('/');
    await completeSetupWizard(page);

    await page.getByTitle('Settings').click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    await page.getByRole('tab', { name: 'Integrations' }).click();
    await page.getByRole('tab', { name: 'Tautulli' }).click();
    await page.getByLabel('Tautulli URL').fill('http://192.168.1.20:8181');
    await page.getByLabel(/API Key/).fill('tautulli-e2e-key-abcdefgh');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText(/Connected! Found 1 users/)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Tautulli settings saved')).toBeVisible();

    await page.getByRole('tab', { name: 'Overseerr' }).click();
    await page.getByLabel('Overseerr URL').fill('http://192.168.1.30:5055');
    await page.getByLabel(/API Key/).fill('overseerr-e2e-key-abcdefgh');
    await page.getByLabel(/Exclude fully available titles from the spin pool/).check();
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText(/Connected to Overseerr 1\.0\.0/)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Overseerr settings saved')).toBeVisible();
  });

  test("tests the Plex server with the Admin's own server token, with no token to enter", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/');
    await completeSetupWizard(page);

    await page.getByTitle('Settings').click();
    await page.getByRole('tab', { name: 'Integrations' }).click();
    await page.getByRole('tab', { name: 'Plex' }).click();

    await expect(page.getByText('Everyone reaches this server with their own Plex sign-in.')).toBeVisible();
    await expect(page.getByLabel(/Plex Token/i)).toHaveCount(0);
    await expect(page.getByLabel('Server URL')).not.toHaveValue('');

    // The fake Plex server answers only the per-server access token sign-in stored.
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText('Connected: 1 library found')).toBeVisible();
  });
});
