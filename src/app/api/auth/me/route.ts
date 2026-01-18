import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const { settings } = await requireAuth();

    return NextResponse.json({
      user: {
        username: settings.plexUsername,
        serverUrl: settings.plexServerUrl,
      },
      preferences: settings.uiPreferences,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'App not configured' },
      { status: 401 }
    );
  }
}
