import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import jwt from 'jsonwebtoken';

// POST /api/settings/setup - Complete initial setup
export async function POST(request: NextRequest) {
  try {
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
    if (!finalServerUrl) {
      try {
        const servers = await plexService.getServers();
        if (servers.length > 0) {
          // Try to find local server first, then fall back to first available
          const localServer = servers.find(s =>
            s.connections.some(c => c.local)
          );
          const server = localServer || servers[0];

          // Prefer local connection
          const localConnection = server.connections.find(c => c.local);
          const connection = localConnection || server.connections[0];

          if (connection) {
            finalServerUrl = connection.uri;
          }
        }
      } catch (err) {
        console.error('Server discovery error:', err);
      }
    }

    if (!finalServerUrl) {
      return NextResponse.json(
        { error: 'Could not determine Plex server URL. Please provide it manually.' },
        { status: 400 }
      );
    }

    // Update settings
    settings.plexToken = plexToken;
    settings.plexServerUrl = finalServerUrl;
    settings.plexUsername = validation.user.username;

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
