import { defineConfig, devices } from '@playwright/test';
import {
  E2E_APP_PORT,
  E2E_MONGO_PORT,
  E2E_MONGO_URI,
  E2E_USES_EXTERNAL_MONGO,
  E2E_DECIDARR_SECRET,
  E2E_RESET_SECRET,
  E2E_PLEX_TV_URL,
} from './tests/e2e/e2e-env';

// Specs read the reset secret from the environment they inherit.
process.env.E2E_TEST_RESET_SECRET = E2E_RESET_SECRET;

const appUrl = `http://127.0.0.1:${E2E_APP_PORT}`;

// Playwright starts web servers in order, before globalSetup, so MongoDB is a
// web server too: it is listening before the app takes its first request.
const mongoServer = {
  command: 'node tests/e2e/start-mongo.mjs',
  port: E2E_MONGO_PORT,
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
  gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10000 },
  env: { E2E_MONGO_PORT: String(E2E_MONGO_PORT) },
};

const appServer = {
  command: `npm run dev -- -p ${E2E_APP_PORT}`,
  url: appUrl,
  reuseExistingServer: !process.env.CI,
  timeout: 120000,
  env: {
    MONGODB_URI: E2E_MONGO_URI,
    SECURE_COOKIES: 'false',
    E2E_MOCK_PLEX: 'true',
    // The fake Plex servers listen on loopback, which only the opt-in allows.
    DECIDARR_ALLOW_PRIVATE_URLS: 'true',
    PLEX_TV_URL: E2E_PLEX_TV_URL,
    E2E_TEST_RESET_SECRET: E2E_RESET_SECRET,
    DECIDARR_SECRET: E2E_DECIDARR_SECRET,
  },
};

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: E2E_USES_EXTERNAL_MONGO ? [appServer] : [mongoServer, appServer],
});
