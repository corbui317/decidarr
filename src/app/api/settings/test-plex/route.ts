import { NextRequest, NextResponse } from 'next/server';
import { PlexService } from '@/lib/services/plex';
import { validatePlexUrl } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:TestPlex');

// POST /api/settings/test-plex - Test Plex connection
// This endpoint is intentionally open (no session required) because:
// - During initial setup, there is no session yet
// - During reconfiguration, the Plex token itself IS the credential being tested
// The token is provided in the request body and validated against plex.tv
export async function POST(request: NextRequest) {
  try {
    logger.debug('Test Plex request received');

    const body = await request.json();
    const { plexToken, plexServerUrl } = body;

    if (!plexToken) {
      return NextResponse.json(
        { error: 'Plex token is required' },
        { status: 400 }
      );
    }

    // Validate plexServerUrl if provided
    if (plexServerUrl) {
      const urlCheck = validatePlexUrl(plexServerUrl);
      if (!urlCheck.valid) {
        return NextResponse.json(
          { valid: false, error: `Invalid server URL: ${urlCheck.error}` },
          { status: 400 }
        );
      }
    }

    // Validate Plex token against plex.tv
    logger.debug('Validating Plex token');
    const plexService = new PlexService(plexToken);
    const validation = await plexService.validateToken();

    if (!validation.valid || !validation.user) {
      logger.warn('Plex token invalid', { error: validation.error });
      return NextResponse.json({
        valid: false,
        error: 'Invalid Plex token',
      });
    }

    logger.info('Plex token valid', { username: validation.user.username });

    // Discover available servers
    let servers: Array<{ name: string; uri: string }> = [];
    try {
      const serverList = await plexService.getServers();
      servers = serverList.map(server => {
        const localConnection = server.connections.find(c => c.local);
        const connection = localConnection || server.connections[0];
        return {
          name: server.name,
          uri: connection?.uri || '',
        };
      }).filter(s => s.uri);
      logger.debug('Discovered servers', { count: servers.length });
    } catch (err) {
      logger.warn('Server discovery error', { error: (err as Error).message });
    }

    // If server URL provided, test direct connection
    let serverValid = false;
    let libraryCount = 0;
    if (plexServerUrl) {
      try {
        logger.debug('Testing server connection', { plexServerUrl });
        const serverPlexService = new PlexService(plexToken, plexServerUrl);
        const sections = await serverPlexService.getLibrarySections();
        serverValid = true;
        libraryCount = sections.length;
        logger.info('Server connection successful', { plexServerUrl, libraryCount });
      } catch (err) {
        logger.warn('Server connection failed', { plexServerUrl, error: (err as Error).message });
        serverValid = false;
      }
    }

    return NextResponse.json({
      valid: true,
      user: {
        username: validation.user.username,
        email: validation.user.email,
        thumb: validation.user.thumb,
      },
      servers,
      serverTest: plexServerUrl ? {
        valid: serverValid,
        libraryCount,
      } : null,
    });
  } catch (error) {
    logger.error('Test Plex error', { error: (error as Error).message });
    return NextResponse.json(
      { valid: false, error: 'Failed to test Plex connection' },
      { status: 500 }
    );
  }
}
