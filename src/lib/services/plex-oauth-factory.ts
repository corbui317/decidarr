/**
 * Plex OAuth Factory
 *
 * Provides OAuth functions, selecting mock implementation in E2E mode.
 * The factory contains the E2E check; production OAuth code has no E2E awareness.
 */

import type { PlexPin, PlexOAuthUser } from './plex-oauth';
import {
  createAuthPin as realCreateAuthPin,
  pollAuthPin as realPollAuthPin,
  fetchPlexUser as realFetchPlexUser,
} from './plex-oauth';

export async function createAuthPin(): Promise<PlexPin> {
  if (process.env.E2E_MOCK_PLEX === 'true') {
    const { mockCreateAuthPin } = await import('../../../tests/helpers/plex-oauth-mocks');
    return mockCreateAuthPin();
  }
  return realCreateAuthPin();
}

export async function pollAuthPin(pinId: number, code: string): Promise<PlexPin> {
  if (process.env.E2E_MOCK_PLEX === 'true') {
    const { mockPollAuthPin } = await import('../../../tests/helpers/plex-oauth-mocks');
    return mockPollAuthPin(pinId, code);
  }
  return realPollAuthPin(pinId, code);
}

export async function fetchPlexUser(authToken: string): Promise<PlexOAuthUser> {
  if (process.env.E2E_MOCK_PLEX === 'true') {
    const { mockFetchPlexUser } = await import('../../../tests/helpers/plex-oauth-mocks');
    return mockFetchPlexUser(authToken);
  }
  return realFetchPlexUser(authToken);
}
