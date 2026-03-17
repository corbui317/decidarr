import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:TestTmdb');

// POST /api/settings/test-tmdb - Test TMDB API key
// Open endpoint (no session required) — the API key being tested IS the credential.
// This is needed during wizard setup when there is no session yet.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'TMDB API key is required' },
        { status: 400 }
      );
    }

    logger.debug('Testing TMDB API key');
    const encodedKey = encodeURIComponent(apiKey.trim());
    const response = await fetch(
      `https://api.themoviedb.org/3/configuration?api_key=${encodedKey}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!response.ok) {
      logger.warn('TMDB API key invalid', { status: response.status });
      return NextResponse.json({
        valid: false,
        error: 'Invalid TMDB API key',
      });
    }

    const data = await response.json();
    logger.info('TMDB API key valid');
    return NextResponse.json({
      valid: true,
      message: 'TMDB API key is valid',
      imageBaseUrl: data.images?.secure_base_url || null,
    });
  } catch (error) {
    logger.error('Test TMDB error', { error: (error as Error).message });
    return NextResponse.json(
      { valid: false, error: 'Failed to test TMDB connection' },
      { status: 500 }
    );
  }
}
