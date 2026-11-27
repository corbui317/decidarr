import { NextResponse } from 'next/server';
import { settingsTestPlexBodySchema, type PlexTestResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService, readPlexServerIdentity } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl } from '@/lib/security/service-url';

const logger = createLogger('API:TestPlex');

/**
 * Checks a Plex server URL. When it reaches this install's server, the Admin's own access token
 * for it lists the libraries; when it reaches a different server, that is reported and no token
 * is sent there (saving it moves the install, ADR 0002).
 */
export const POST = route({ access: 'admin', body: settingsTestPlexBodySchema }, async ({ session, body }) => {
  const urlCheck = await assertSafeServiceUrl(body.plexServerUrl);
  if (!urlCheck.valid) {
    throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
  }
  const serverUrl = urlCheck.normalized || body.plexServerUrl;

  const machineId = await readPlexServerIdentity(serverUrl);
  if (!machineId) {
    return NextResponse.json<PlexTestResponse>({ valid: false, error: 'No Plex server answered at that URL' });
  }
  if (machineId !== (await getOrCreateSettings()).plexMachineId) {
    return NextResponse.json<PlexTestResponse>({ valid: true, differentServer: true });
  }

  try {
    const sections = await new PlexService(session.plex.token, serverUrl).getLibrarySections();
    logger.info('Server connection successful', { libraryCount: sections.length });
    return NextResponse.json<PlexTestResponse>({ valid: true, libraryCount: sections.length });
  } catch (err) {
    logger.warn('Server connection failed', { error: (err as Error).message });
    return NextResponse.json<PlexTestResponse>({ valid: false, error: 'Could not reach the Plex server at that URL' });
  }
});
