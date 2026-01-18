import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';

// GET /api/settings/status - Check if app is configured (public endpoint)
export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    const plexToken = settings.getDecryptedPlexToken();

    return NextResponse.json({
      setupComplete: settings.setupComplete,
      hasPlexToken: !!plexToken,
      hasPlexServer: !!settings.plexServerUrl,
      hasTmdbKey: !!settings.getDecryptedTmdbKey(),
      plexUsername: settings.plexUsername || null,
    });
  } catch (error) {
    console.error('Settings status error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings status', setupComplete: false },
      { status: 500 }
    );
  }
}
