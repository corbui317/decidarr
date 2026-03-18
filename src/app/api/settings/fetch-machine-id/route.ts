import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:FetchMachineId');

// POST /api/settings/fetch-machine-id
// Fetches the machineId from the configured Plex server and stores it
export async function POST() {
  try {
    const { plexToken, plexServerUrl, settings } = await requireAuth();

    // If we already have a machineId, return it
    if (settings.plexMachineId) {
      logger.debug('MachineId already stored', { machineId: settings.plexMachineId });
      return NextResponse.json({
        success: true,
        machineId: settings.plexMachineId,
        cached: true,
      });
    }

    // Fetch from server
    logger.info('Fetching machineId from Plex server');
    const plexService = new PlexService(plexToken, plexServerUrl);
    const machineId = await plexService.fetchMachineIdFromServer();

    if (!machineId) {
      return NextResponse.json(
        { error: 'Could not fetch machineId from Plex server' },
        { status: 500 }
      );
    }

    // Store it
    settings.plexMachineId = machineId;
    await settings.save();

    logger.info('MachineId stored successfully', { machineId });
    return NextResponse.json({
      success: true,
      machineId,
      cached: false,
    });
  } catch (error) {
    logger.error('Error fetching machineId', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Failed to fetch machineId' },
      { status: 500 }
    );
  }
}
