/**
 * The one place E2E connection settings live. playwright.config.ts passes these
 * to the servers it starts, and specs import them, so the app, the seed routes
 * and any direct database assertions always agree.
 */

export const E2E_APP_PORT = 3101;
export const E2E_MONGO_PORT = 27101;

/** A developer may point E2E at an existing MongoDB instead of the in-memory one. */
const externalMongoUri = process.env.CI ? undefined : process.env.E2E_MONGODB_URI?.trim();

export const E2E_USES_EXTERNAL_MONGO = Boolean(externalMongoUri);
export const E2E_MONGO_URI = externalMongoUri || `mongodb://127.0.0.1:${E2E_MONGO_PORT}/decidarr-e2e`;

export const E2E_DECIDARR_SECRET = 'e2e-test-secret-key-0123456789abcdef';
export const E2E_RESET_SECRET = process.env.E2E_TEST_RESET_SECRET?.trim() || 'decidarr-e2e-reset';

/** The fake plex.tv and Plex Media Server the app talks to over loopback (tests/e2e/fake-plex.ts). */
export const E2E_PLEX_TV_URL = 'http://127.0.0.1:3102';
export const E2E_PLEX_SERVER_URL = 'http://127.0.0.1:3103';
