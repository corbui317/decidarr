import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:TestTmdb');

const bodyContract = z.object({ apiKey: z.string().min(1, 'TMDB API key is required') });

// POST /api/settings/test-tmdb - Test TMDB API key
// Open endpoint (no session required) - the API key being tested IS the credential.
// This is needed during wizard setup when there is no session yet.
export const POST = route({ access: 'public', body: bodyContract }, async ({ body }) => {
  const { apiKey } = body;

  logger.debug('Testing TMDB API key');
  const encodedKey = encodeURIComponent(apiKey.trim());
  const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodedKey}`, {
    signal: AbortSignal.timeout(10_000),
  });

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
});
