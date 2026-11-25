import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { TMDbService } from '@/lib/services/tmdb';

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
    const result = await new TMDbService(apiKey.trim()).testApiKey();

    if (!result.valid) {
      logger.warn('TMDB API key invalid');
      return NextResponse.json({
        valid: false,
        error: 'Invalid TMDB API key',
      });
    }

    logger.info('TMDB API key valid');
    return NextResponse.json({
      valid: true,
      message: 'TMDB API key is valid',
      imageBaseUrl: result.imageBaseUrl,
    });
  } catch (error) {
    logger.error('Test TMDB error', { error: (error as Error).message });
    return NextResponse.json(
      { valid: false, error: 'Failed to test TMDB connection' },
      { status: 500 }
    );
  }
}
