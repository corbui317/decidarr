import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';

const SPIN = { plexId: 'e2e-history-1', title: 'E2E History Spin', mediaType: 'movie' };

test.describe('Spin history', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('records a same-origin write and rejects a cross-origin one', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await completeSetupWizard(page);

    // The browser sends its own Origin and Host, as the web app's history call does.
    const status = await page.evaluate(async (body) => {
      const res = await fetch('/api/spin-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.status;
    }, SPIN);
    expect(status).toBe(201);

    await page.reload();
    await expect(page.getByText(SPIN.title)).toBeVisible({ timeout: 15000 });

    // Same session cookie, forged Origin: a sibling site posting on the user's behalf.
    const forged = await page.request.post('/api/spin-history', {
      headers: { Origin: 'https://evil.example' },
      data: { ...SPIN, title: 'Forged Spin' },
    });
    expect(forged.status()).toBe(403);
    expect((await forged.json()).code).toBe('FORBIDDEN');
  });
});
