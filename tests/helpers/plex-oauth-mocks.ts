/**
 * Mock Plex OAuth Functions for E2E Tests
 *
 * These are test-only mock implementations for Plex OAuth flow.
 * Imported only when NODE_ENV !== 'production' && E2E_MOCK_PLEX === 'true'.
 * Production builds dead-code-eliminate the import because Next.js inlines
 * NODE_ENV as a literal, and the webpack alias stubs this file to ensure
 * it never reaches the bundle.
 */

import type { PlexPin, PlexOAuthUser } from '@/lib/services/plex-oauth';

const E2E_MOCK_PIN_ID = 424242;
const E2E_MOCK_PIN_CODE = 'e2e-mock-pin-code';
const E2E_MOCK_AUTH_TOKEN = 'e2e-test-plex-token-valid';

export const E2E_MOCK_OAUTH_USER: PlexOAuthUser = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};

export async function mockCreateAuthPin(): Promise<PlexPin> {
  return { id: E2E_MOCK_PIN_ID, code: E2E_MOCK_PIN_CODE };
}

export async function mockPollAuthPin(pinId: number, code: string): Promise<PlexPin> {
  return {
    id: pinId,
    code,
    authToken: E2E_MOCK_AUTH_TOKEN,
  };
}

export async function mockFetchPlexUser(_authToken: string): Promise<PlexOAuthUser> {
  return E2E_MOCK_OAUTH_USER;
}
