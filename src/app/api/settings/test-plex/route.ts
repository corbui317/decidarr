import { NextRequest, NextResponse } from 'next/server';
import { PlexService } from '@/lib/services/plex';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { connectDB } from '@/lib/db';

const logger = createLogger('API:TestPlex');

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    if (!settings.setupComplete) {
      const setupCheck = await assertSetupSecretAllowed(request);
      if (!setupCheck.ok) {
        return NextResponse.json(
          { valid: false, error: setupCheck.error, code: setupCheck.code },
          { status: setupCheck.status }
        );
      }
    } else {
      await requireAdmin();
    }

    logger.debug('Test Plex request received');

    const body = await request.json();
    const { plexToken, plexServerUrl } = body;

    if (!plexToken) {
      return NextResponse.json(
        { error: 'Plex token is required' },
        { status: 400 }
      );
    }

    if (plexServerUrl) {
      const urlCheck = await assertSafeServiceUrl(plexServerUrl, {
        allowPrivateNetworks: allowPrivateServiceUrls(),
      });
      if (!urlCheck.valid) {
        return NextResponse.json(
          { valid: false, error: urlCheck.error || 'Invalid or disallowed service URL' },
          { status: 400 }
        );
      }
    }

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

    let serverValid = false;
    let libraryCount = 0;
    if (plexServerUrl) {
      try {
        const safeUrl = await assertSafeServiceUrl(plexServerUrl, {
          allowPrivateNetworks: allowPrivateServiceUrls(),
        });
        const normalizedUrl = safeUrl.normalized || plexServerUrl;
        logger.debug('Testing server connection', { plexServerUrl: normalizedUrl });
        const serverPlexService = new PlexService(plexToken, normalizedUrl);
        const sections = await serverPlexService.getLibrarySections();
        serverValid = true;
        libraryCount = sections.length;
        logger.info('Server connection successful', { libraryCount });
      } catch (err) {
        logger.warn('Server connection failed', { error: (err as Error).message });
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
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Test Plex error', { error: (error as Error).message });
    return NextResponse.json(
      { valid: false, error: 'Failed to test Plex connection' },
      { status: 500 }
    );
  }
}
