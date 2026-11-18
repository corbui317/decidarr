import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/plex-mocks';

test.describe('Empty pool UX', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('spin button shows guidance when no library selected', async ({ page }) => {
    await page.goto('/');
    await completeSetupWizard(page);
    await expect(page.getByText(/Select at least one library/i)).toBeVisible({
      timeout: 15000,
    });
  });
});
