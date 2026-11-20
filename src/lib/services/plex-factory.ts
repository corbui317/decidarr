/**
 * Plex Service Factory
 *
 * Provides PlexService instances, selecting mock implementation in E2E mode.
 * The factory contains the E2E check; production services have no E2E awareness.
 */

import { PlexService } from './plex';

export async function createPlexService(
  authToken: string,
  serverUrl?: string | null,
  machineId?: string | null
): Promise<PlexService> {
  if (process.env.NODE_ENV !== 'production' && process.env.E2E_MOCK_PLEX === 'true') {
    const { MockPlexService } = await import('../../../tests/helpers/plex-mock-service');
    return new MockPlexService(authToken, serverUrl, machineId) as unknown as PlexService;
  }

  return new PlexService(authToken, serverUrl, machineId);
}
