import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireAdminSession } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { createPlexService } from '@/lib/services/plex-factory';
import { createLogger } from '@/lib/logger';
import { assertSetupSecretAllowed } from '@/lib/security/setup-secret';
import { assertSafeServiceUrl, allowPrivateServiceUrls } from '@/lib/security/service-url';
import { getOrCreateSettings } from '@/lib/models/Settings';

const logger = createLogger('API:TestPlex');

const bodyContract = z.object({
  plexToken: z.string().min(1, 'Plex token is required'),
  plexServerUrl: z.string().optional(),
});

export const POST = route({ access: 'public', body: bodyContract }, async ({ request, body }) => {
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
    await requireAdminSession(request);
  }

  logger.debug('Test Plex request received');

  const { plexToken, plexServerUrl } = body;

  if (plexServerUrl) {
    const urlCheck = await assertSafeServiceUrl(plexServerUrl, {
      allowPrivateNetworks: allowPrivateServiceUrls(),
    });
    if (!urlCheck.valid) {
      throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
    }
  }

  logger.debug('Validating Plex token');
  const plexService = await createPlexService(plexToken);
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
    servers = serverList
      .map((server) => {
        const localConnection = server.connections.find((c) => c.local);
        const connection = localConnection || server.connections[0];
        return {
          name: server.name,
          uri: connection?.uri || '',
        };
      })
      .filter((s) => s.uri);
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
      const serverPlexService = await createPlexService(plexToken, normalizedUrl);
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
    serverTest: plexServerUrl
      ? {
          valid: serverValid,
          libraryCount,
        }
      : null,
  });
});
