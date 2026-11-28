import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';

// The E2E fake Plex titles each item's metadata "Fake Movie <plexId>"; history keeps the title Spin showed.
const SPUN_ENTRY = /Remove Fake Movie movie-(1|2) from history/;

const SPIN = { plexId: 'e2e-history-1', title: 'E2E History Spin', mediaType: 'movie' };

test.describe('Spin history', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('a spin from the dashboard lands in Recent Spins, recorded by the server', async ({ page }) => {
    test.setTimeout(60000);
    const historyWrites: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/spin-history') historyWrites.push(req.url());
    });

    await page.goto('/');
    await completeSetupWizard(page);
    const movies = page.getByRole('group', { name: 'Movies' }).getByRole('button', { name: /Movies/ });
    if ((await movies.getAttribute('aria-pressed')) !== 'true') await movies.click();

    const spin = page.getByRole('button', { name: 'Spin for a random pick' });
    await expect(spin).toBeEnabled({ timeout: 15000 });
    await spin.click();

    await expect(page.getByRole('button', { name: SPUN_ENTRY })).toBeVisible({
      timeout: 15000,
    });
    expect(historyWrites).toEqual([]);

    // Still there after a reload: the entry is stored, not just shown.
    await page.reload();
    await expect(page.getByRole('button', { name: SPUN_ENTRY })).toBeVisible({
      timeout: 15000,
    });
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
