import { NextResponse } from 'next/server';
import { settingsTestPlexBodySchema, type PlexTestResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import { assertSafeServiceUrl } from '@/lib/security/service-url';

const logger = createLogger('API:TestPlex');

/** Checks that a Plex server URL answers the Admin with their own access token for this install's server. */
export const POST = route({ access: 'admin', body: settingsTestPlexBodySchema }, async ({ session, body }) => {
  const urlCheck = await assertSafeServiceUrl(body.plexServerUrl);
  if (!urlCheck.valid) {
    throw new DomainError('VALIDATION_FAILED', urlCheck.error || 'Invalid or disallowed service URL');
  }
  const serverUrl = urlCheck.normalized || body.plexServerUrl;

  try {
    const sections = await new PlexService(session.plex.token, serverUrl).getLibrarySections();
    logger.info('Server connection successful', { libraryCount: sections.length });
    return NextResponse.json<PlexTestResponse>({ valid: true, libraryCount: sections.length });
  } catch (err) {
    logger.warn('Server connection failed', { error: (err as Error).message });
    return NextResponse.json<PlexTestResponse>({ valid: false, error: 'Could not reach the Plex server at that URL' });
  }
});
