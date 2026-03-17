import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { validatePlexUrl } from '@/lib/auth';
import { createLogger } from '@/lib/logger';
import jwt from 'jsonwebtoken';

const logger = createLogger('API:Setup');

// POST /api/settings/setup - Complete initial setup (or reconfigure)
// Re-setup is allowed without a session: the Plex token itself proves ownership.
export async function POST(request: NextRequest) {
  try {
    logger.debug('Setup request received');
    await connectDB();
    const settings = await getOrCreateSettings();

    const body = await request.json();
    const { plexToken, plexServerUrl, tmdbApiKey } = body;

    if (!plexToken) {
      return NextResponse.json(
        { error: 'Plex token is required' },
        { status: 400 }
      );
    }

    // Validate Plex token against plex.tv
    logger.debug('Validating Plex token');
    const plexService = new PlexService(plexToken);
    const validation = await plexService.validateToken();

    if (!validation.valid || !validation.user) {
      logger.warn('Setup failed: invalid Plex token', { error: validation.error });
      return NextResponse.json(
        { error: 'Invalid Plex token. Please check and try again.' },
        { status: 401 }
      );
    }

    logger.info('Plex token valid', { username: validation.user.username });

    // Try to discover local server URL and machineId
    let finalServerUrl = plexServerUrl;
    let machineId: string | null = null;

    try {
      logger.debug('Discovering Plex servers');
      const servers = await plexService.getServers();
      logger.info('Found Plex servers', { count: servers.length });

      if (servers.length > 0) {
        const localServer = servers.find(s => s.connections.some(c => c.local));
        const server = localServer || servers[0];
        machineId = server.clientIdentifier;

        if (!finalServerUrl) {
          const localConnection = server.connections.find(c => c.local);
          const connection = localConnection || server.connections[0];
          if (connection) {
            finalServerUrl = connection.uri;
            logger.info('Auto-discovered server URL', { url: finalServerUrl });
          }
        }
      }
    } catch (err) {
      logger.warn('Server discovery failed (will use manually entered URL)', {
        error: (err as Error).message,
      });
    }

    if (!finalServerUrl) {
      return NextResponse.json(
        { error: 'Could not determine Plex server URL. Please provide it manually.' },
        { status: 400 }
      );
    }

    // Validate the server URL to prevent SSRF
    const urlCheck = validatePlexUrl(finalServerUrl);
    if (!urlCheck.valid) {
      logger.warn('Invalid Plex server URL', { url: finalServerUrl, error: urlCheck.error });
      return NextResponse.json(
        { error: `Invalid server URL: ${urlCheck.error}` },
        { status: 400 }
      );
    }

    const normalizedUrl = urlCheck.normalized || finalServerUrl;
    logger.info('Saving settings', { serverUrl: normalizedUrl, username: validation.user.username });

    // Save settings
    settings.plexToken = plexToken;
    settings.plexServerUrl = normalizedUrl;
    settings.plexUsername = validation.user.username;
    if (machineId) {
      settings.plexMachineId = machineId;
    }
    if (tmdbApiKey) {
      settings.tmdbApiKey = tmdbApiKey;
    }
    settings.setupComplete = true;
    await settings.save();

    // Issue a session cookie so the user is immediately authenticated
    const jwtSecret = settings.getJwtSecret();
    const sessionToken = jwt.sign(
      {
        type: 'session',
        username: validation.user.username,
        setupAt: Date.now(),
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const cookieStore = await cookies();
    // secure: false because this is a self-hosted app commonly accessed over HTTP on a LAN.
    // Enabling secure cookies on HTTP causes browsers to silently drop them.
    // Users who deploy behind HTTPS can set SECURE_COOKIES=true in their environment.
    cookieStore.set('decidarr_session', sessionToken, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIES === 'true',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    logger.info('Setup complete', { username: validation.user.username });
    return NextResponse.json({
      success: true,
      message: 'Setup complete!',
      plex: {
        username: validation.user.username,
        serverUrl: normalizedUrl,
      },
    });
  } catch (error) {
    logger.error('Setup error', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Setup failed. Please try again.' },
      { status: 500 }
    );
  }
}
