import { test, expect } from '@playwright/test';
import mongoose from 'mongoose';
import { resetE2eDatabase, completeSetupWizard } from './helpers/e2e-test-helpers';
import { E2E_DECIDARR_SECRET, E2E_MONGO_URI } from './e2e-env';
import { encryptSecret } from '@/lib/secrets';

// Lets this process encrypt a token the way the E2E server stores it.
process.env.DECIDARR_SECRET = E2E_DECIDARR_SECRET;

/** Replaces every user's stored server token with one the fake Plex server refuses, as when sharing is revoked. */
async function revokeServerTokens(): Promise<void> {
  const client = await new mongoose.mongo.MongoClient(E2E_MONGO_URI).connect();
  try {
    const users = client.db().collection('users');
    for (const user of await users.find({}).toArray()) {
      const location = { recordType: 'user' as const, recordId: String(user._id), field: 'plexServerToken' };
      await users.updateOne({ _id: user._id }, { $set: { plexServerToken: encryptSecret('revoked-server-token', location) } });
    }
  } finally {
    await client.close();
  }
}

test.describe('A Plex server token that stops working', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('asks the user to sign in again, and signing in again restores their libraries', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/');
    await completeSetupWizard(page);
    await expect(page.getByText('Movies').first()).toBeVisible();

    await revokeServerTokens();
    await page.reload();

    await expect(page.getByText(/sign in again/i).first()).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Sign in again' }).click();

    await page.getByRole('button', { name: 'Login with Plex' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    await expect(page.getByText('Movies').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/sign in again/i)).toHaveCount(0);
  });
});
