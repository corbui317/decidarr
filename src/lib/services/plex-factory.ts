/**
 * Plex Service Factory
 *
 * Provides PlexService instances, selecting mock implementation in E2E mode.
 * The factory contains the E2E check; production services have no E2E awareness.
 */

import { PlexService } from './plex';
import { isE2eMockMode } from '@/lib/test-mode';

export async function createPlexService(
  authToken: string,
  serverUrl?: string | null,
  machineId?: string | null
): Promise<PlexService> {
  if (isE2eMockMode()) {
    const { MockPlexService } = await import('../../../tests/helpers/plex-mock-service');
    return new MockPlexService(authToken, serverUrl, machineId) as unknown as PlexService;
  }

  return new PlexService(authToken, serverUrl, machineId);
}
