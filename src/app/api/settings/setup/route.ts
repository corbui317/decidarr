import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:Setup');

/** Save optional TMDB key after OAuth setup, or update integration keys during admin reconfigure */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    const body = await request.json();
    const { tmdbApiKey } = body;

    if (settings.setupComplete) {
      await requireAdmin();
      if (tmdbApiKey) {
        settings.tmdbApiKey = tmdbApiKey;
        await settings.save();
      }
      return NextResponse.json({ success: true, message: 'Settings updated' });
    }

    return NextResponse.json(
      {
        error: 'Complete setup by signing in with Plex.',
        useOAuth: true,
      },
      { status: 400 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('Setup error', { error: (error as Error).message });
    return NextResponse.json({ error: 'Setup failed. Please try again.' }, { status: 500 });
  }
}
