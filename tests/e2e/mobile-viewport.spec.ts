import { test, expect } from '@playwright/test';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';

const MOBILE_VIEWPORTS = [
  { name: '375px', width: 375, height: 667 },
  { name: '414px', width: 414, height: 896 },
] as const;

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(hasOverflow, 'page should not scroll horizontally').toBe(false);
}

async function assertMinTouchTarget(
  page: import('@playwright/test').Page,
  selector: string,
  label: string
) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${label} should be visible`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`Mobile viewport smoke (${viewport.name})`, () => {
    test.beforeEach(async ({ page, request }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await resetE2eDatabase(request);
      await page.goto('/');
      await completeSetupWizard(page);
    });

    test('dashboard fits without horizontal overflow', async ({ page }) => {
      await expect(page.getByRole('button', { name: /SPIN/i })).toBeVisible({ timeout: 15000 });
      await assertNoHorizontalOverflow(page);
    });

    test('primary touch targets meet 44px minimum', async ({ page }) => {
      await expect(page.getByRole('button', { name: /SPIN/i })).toBeVisible({ timeout: 15000 });
      await assertMinTouchTarget(page, 'button[aria-label="Settings"]', 'Settings button');
      await assertMinTouchTarget(page, 'button:has-text("Logout")', 'Logout button');
      await assertMinTouchTarget(page, 'button[aria-label="Spin for a random pick"]', 'Spin button');
    });

    test('settings modal opens and fits viewport', async ({ page }) => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertMinTouchTarget(page, 'button[aria-label="Close settings"]', 'Close settings');
    });
  });
}

test.describe('PWA shell', () => {
  test('manifest and service worker are available', async ({ page }) => {
    const manifestResponse = await page.request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.display).toBe('standalone');
    expect(manifest.short_name).toBe('Decidarr');

    await page.goto('/');
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration('/');
      return Boolean(registration);
    });

    // Registration is async; wait briefly after page load
    await page.waitForTimeout(500);
    const swRegisteredAfterWait = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration('/');
      return Boolean(registration);
    });
    expect(swRegistered || swRegisteredAfterWait).toBe(true);
  });
});
