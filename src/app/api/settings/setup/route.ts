import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { validateSession, validatePlexUrl } from '@/lib/auth';
import jwt from 'jsonwebtoken';

// POST /api/settings/setup - Complete initial setup
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    // If setup is already complete, require a valid session to re-configure
    if (settings.setupComplete) {
      const valid = await validateSession();
      if (!valid) {
        return NextResponse.json(
          { error: 'Unauthorized: app is already configured' },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const { plexToken, plexServerUrl, tmdbApiKey } = body;

    if (!plexToken) {
      return NextResponse.json(
        { error: 'Plex token is required' },
        { status: 400 }
      );
    }

    // Validate Plex token
    const plexService = new PlexService(plexToken);
    const validation = await plexService.validateToken();

    if (!validation.valid || !validation.user) {
      return NextResponse.json(
        { error: 'Invalid Plex token. Please check and try again.' },
        { status: 401 }
      );
    }

    // If no server URL provided, try to discover it
    let finalServerUrl = plexServerUrl;
    let machineId: string | null = null;

    try {
      const servers = await plexService.getServers();
      if (servers.length > 0) {
        const localServer = servers.find(s => s.connections.some(c => c.local));
        const server = localServer || servers[0];
        machineId = server.clientIdentifier;

        if (!finalServerUrl) {
          const localConnection = server.connections.find(c => c.local);
          const connection = localConnection || server.connections[0];
          if (connection) {
            finalServerUrl = connection.uri;
          }
        }
      }
    } catch (err) {
      console.error('Server discovery error:', err);
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
      return NextResponse.json(
        { error: `Invalid server URL: ${urlCheck.error}` },
        { status: 400 }
      );
    }

    // Update settings with normalized URL
    settings.plexToken = plexToken;
    settings.plexServerUrl = urlCheck.normalized || finalServerUrl;
    settings.plexUsername = validation.user.username;
    if (machineId) {
      settings.plexMachineId = machineId;
    }

    if (tmdbApiKey) {
      settings.tmdbApiKey = tmdbApiKey;
    }

    settings.setupComplete = true;
    await settings.save();

    // Create a session token using the settings JWT secret
    const jwtSecret = settings.getJwtSecret();
    const sessionToken = jwt.sign(
      {
        type: 'session',
        username: validation.user.username,
        setupAt: Date.now()
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set('decidarr_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      message: 'Setup complete!',
      plex: {
        username: validation.user.username,
        serverUrl: finalServerUrl,
      },
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed. Please try again.' },
      { status: 500 }
    );
  }
}
