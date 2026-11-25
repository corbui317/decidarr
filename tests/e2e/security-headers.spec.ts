import { test, expect } from '@playwright/test';
import { resetE2eDatabase } from './helpers/e2e-test-helpers';

function assertSecurityHeaders(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
}

test.describe('Security headers', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('a page response carries the security headers', async ({ page }) => {
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    assertSecurityHeaders(response!.headers());
  });

  test('an API response carries the security headers', async ({ request }) => {
    const response = await request.get('/api/auth/me');
    assertSecurityHeaders(response.headers());
  });
});
