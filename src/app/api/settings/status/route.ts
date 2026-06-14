import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';

// GET /api/settings/status - Check if app is configured (public endpoint)
export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    return NextResponse.json({
      setupComplete: settings.setupComplete,
      hasPlexServer: !!settings.plexServerUrl,
      hasTmdbKey: !!settings.getDecryptedTmdbKey(),
    });
  } catch (error) {
    console.error('Settings status error:', error);
    return NextResponse.json(
      { error: 'Failed to get settings status', setupComplete: false },
      { status: 500 }
    );
  }
}
