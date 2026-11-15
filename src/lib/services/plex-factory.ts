/**
 * Plex Service Factory
 *
 * Provides PlexService instances, selecting mock implementation in E2E mode.
 * The factory contains the E2E check; production services have no E2E awareness.
 */

import { PlexService } from './plex';

export async function createPlexService(
  authToken: string,
  serverUrl?: string
): Promise<PlexService> {
  if (process.env.E2E_MOCK_PLEX === 'true') {
    const { MockPlexService } = await import('../../../tests/helpers/plex-mock-service');
    return new MockPlexService(authToken, serverUrl) as unknown as PlexService;
  }

  return new PlexService(authToken, serverUrl);
}
