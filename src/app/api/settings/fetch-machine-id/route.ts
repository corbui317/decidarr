import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:FetchMachineId');

// POST /api/settings/fetch-machine-id
// Fetches the machineId from the configured Plex server and stores it
export const POST = route({ access: 'admin' }, async ({ session }) => {
  const settings = await getOrCreateSettings();

  if (settings.plexMachineId) {
    logger.debug('MachineId already stored', { machineId: settings.plexMachineId });
    return NextResponse.json({
      success: true,
      machineId: settings.plexMachineId,
      cached: true,
    });
  }

  logger.info('Fetching machineId from Plex server');
  const plexService = new PlexService(session.plex.token, session.plex.serverUrl);
  const machineId = await plexService.fetchMachineIdFromServer();

  if (!machineId) {
    throw new DomainError('INTEGRATION_UNAVAILABLE', 'Could not fetch machineId from Plex server');
  }

  settings.plexMachineId = machineId;
  await settings.save();

  logger.info('MachineId stored successfully', { machineId });
  return NextResponse.json({
    success: true,
    machineId,
    cached: false,
  });
});
