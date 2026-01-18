import { NextRequest, NextResponse } from 'next/server';

// POST /api/settings/test-tmdb - Test TMDB API key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'TMDB API key is required' },
        { status: 400 }
      );
    }

    // Test the API key by making a simple request
    const response = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${apiKey}`
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
