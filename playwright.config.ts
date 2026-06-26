import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const mongoUriFile = path.join(__dirname, '.e2e-mongo-uri');
const e2eMongoUri = fs.existsSync(mongoUriFile)
  ? fs.readFileSync(mongoUriFile, 'utf-8').trim()
  : process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/decidarr-e2e';

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
    command: 'npm run dev -- -p 3101',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      MONGODB_URI: e2eMongoUri,
      SECURE_COOKIES: 'false',
      E2E_MOCK_PLEX: 'true',
      DECIDARR_ALLOW_PRIVATE_URLS: 'true',
    },
  },
});
