import { defineConfig, devices } from '@playwright/test';

const e2eResetSecret = process.env.E2E_TEST_RESET_SECRET ?? 'decidarr-e2e-reset';
process.env.E2E_TEST_RESET_SECRET = e2eResetSecret;

const defaultMongoUri = 'mongodb://127.0.0.1:27017/decidarr-e2e';
const mongoUriShell =
  'export MONGODB_URI="${E2E_MONGODB_URI:-$(test -f .e2e-mongo-uri && cat .e2e-mongo-uri || echo ' +
  defaultMongoUri +
  ')}"';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `sh -c '${mongoUriShell}; exec npm run dev -- -p 3101'`,
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      SECURE_COOKIES: 'false',
      E2E_MOCK_PLEX: 'true',
      DECIDARR_ALLOW_PRIVATE_URLS: 'true',
      E2E_TEST_RESET_SECRET: e2eResetSecret,
    },
  },
});
