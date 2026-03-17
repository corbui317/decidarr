import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';

// POST /api/settings/test-tmdb - Test TMDB API key
// Allowed during initial setup (no session) OR with a valid session post-setup.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();
    if (settings.setupComplete) {
      const valid = await validateSession();
      if (!valid) {
        return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'TMDB API key is required' },
        { status: 400 }
      );
    }

    // Encode the key safely to prevent URL injection
    const encodedKey = encodeURIComponent(apiKey.trim());
    const response = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${encodedKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!response.ok) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid TMDB API key',
      });
    }

    const data = await response.json();

    return NextResponse.json({
      valid: true,
      message: 'TMDB API key is valid',
      imageBaseUrl: data.images?.secure_base_url || null,
    });
  } catch (error) {
    console.error('Test TMDB error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to test TMDB connection' },
      { status: 500 }
    );
  }
}
