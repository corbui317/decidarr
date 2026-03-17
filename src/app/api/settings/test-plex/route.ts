import { NextRequest, NextResponse } from 'next/server';
import { PlexService } from '@/lib/services/plex';
import { validateSession, validatePlexUrl } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';

// POST /api/settings/test-plex - Test Plex connection
// Allowed during initial setup (no session) OR with a valid session post-setup.
export async function POST(request: NextRequest) {
  try {
    // Require auth if the app is already configured
    await connectDB();
    const settings = await getOrCreateSettings();
    if (settings.setupComplete) {
      const valid = await validateSession();
      if (!valid) {
        return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

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

    // Validate Plex token
    const plexService = new PlexService(plexToken);
    const validation = await plexService.validateToken();

    if (!validation.valid || !validation.user) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid Plex token',
      });
    }

    // Get available servers
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
    } catch (err) {
      console.error('Server discovery error:', err);
    }

    // If server URL provided, test connection to it
    let serverValid = false;
    let libraryCount = 0;
    if (plexServerUrl) {
      try {
        const serverPlexService = new PlexService(plexToken, plexServerUrl);
        const sections = await serverPlexService.getLibrarySections();
        serverValid = true;
        libraryCount = sections.length;
      } catch (err) {
        console.error('Server connection error:', err);
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
    console.error('Test Plex error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to test Plex connection' },
      { status: 500 }
    );
  }
}
