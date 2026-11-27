import { NextResponse } from 'next/server';
import { settingsTestTmdbBodySchema, type TmdbTestResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { createLogger } from '@/lib/logger';
import { TMDbService } from '@/lib/services/tmdb';

const logger = createLogger('API:TestTmdb');

// POST /api/settings/test-tmdb - Test TMDB API key
// Open endpoint (no session required) - the API key being tested IS the credential.
// This is needed during wizard setup when there is no session yet.
export const POST = route({ access: 'public', body: settingsTestTmdbBodySchema }, async ({ body }) => {
  const { apiKey } = body;

  logger.debug('Testing TMDB API key');
  const result = await new TMDbService(apiKey.trim()).testApiKey();

  if (!result.valid) {
    logger.warn('TMDB API key invalid');
    const invalidResponse: TmdbTestResponse = { valid: false, error: 'Invalid TMDB API key' };
    return NextResponse.json(invalidResponse);
  }

  logger.info('TMDB API key valid');
  const response: TmdbTestResponse = {
    valid: true,
    message: 'TMDB API key is valid',
    imageBaseUrl: result.imageBaseUrl,
  };
  return NextResponse.json(response);
});
