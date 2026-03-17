import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { createLogger } from '@/lib/logger';
import jwt from 'jsonwebtoken';

const logger = createLogger('API:Login');

// POST /api/auth/login - Re-issue session for an already-configured single-user app
// This is called when the app is set up but the session cookie has expired or been cleared.
// Since this is a self-hosted single-user app, we verify the stored Plex token is still valid
// and issue a new session cookie — no additional credentials needed.
export async function POST() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    if (!settings.setupComplete) {
      logger.warn('Login attempted but app is not configured');
      return NextResponse.json(
        { error: 'App is not configured. Please complete setup first.' },
        { status: 400 }
      );
    }

    const plexToken = settings.getDecryptedPlexToken();
    if (!plexToken) {
      logger.warn('Login attempted but no Plex token stored');
      return NextResponse.json(
        { error: 'No Plex credentials found. Please reconfigure the app.' },
        { status: 400 }
      );
    }

    // Verify the stored Plex token is still valid
    logger.debug('Verifying stored Plex token for login');
    const plexService = new PlexService(plexToken, settings.plexServerUrl || null);
    const validation = await plexService.validateToken();

    if (!validation.valid) {
      logger.warn('Login failed: stored Plex token is no longer valid', { error: validation.error });
      return NextResponse.json(
        {
          error: 'Your Plex token has expired. Please go through setup again to reconnect.',
          requiresSetup: true,
        },
        { status: 401 }
      );
    }

    // Issue a new session cookie
    const jwtSecret = settings.getJwtSecret();
    const sessionToken = jwt.sign(
      {
        type: 'session',
        username: validation.user?.username || settings.plexUsername,
        loginAt: Date.now(),
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

    logger.info('Login successful', { username: validation.user?.username || settings.plexUsername });
    return NextResponse.json({
      success: true,
      user: {
        username: validation.user?.username || settings.plexUsername,
        serverUrl: settings.plexServerUrl,
      },
    });
  } catch (error) {
    logger.error('Login error', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
