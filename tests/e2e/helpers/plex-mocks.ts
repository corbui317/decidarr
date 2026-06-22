import type { Page, APIRequestContext } from '@playwright/test';

export async function resetE2eDatabase(request: APIRequestContext) {
  const res = await request.post('/api/test/reset');
  if (!res.ok()) {
    throw new Error(`Failed to reset E2E database: ${res.status()}`);
  }
}

export async function completeSetupWizard(page: Page) {
  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByRole('button', { name: /Sign in with Plex/i }).click();
  await page.getByRole('heading', { name: 'TMDB Integration' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /Skip|Complete Setup/i }).click();
  await page.getByRole('button', { name: 'Start Exploring' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}
