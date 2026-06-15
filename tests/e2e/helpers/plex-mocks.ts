import type { Page, APIRequestContext } from '@playwright/test';

export async function resetE2eDatabase(request: APIRequestContext) {
  const res = await request.post('/api/test/reset');
  if (!res.ok()) {
    throw new Error(`Failed to reset E2E database: ${res.status()}`);
  }
}

export async function completeSetupWizard(page: Page) {
  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByPlaceholder('Enter your Plex token').fill('e2e-test-plex-token-valid');
  await page.getByRole('button', { name: 'Validate' }).click();
  await page.getByRole('button', { name: 'Next' }).click({ timeout: 15000 });
  await page.getByRole('button', { name: /Skip|Complete Setup/i }).click();
  await page.getByRole('button', { name: 'Start Exploring' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}
