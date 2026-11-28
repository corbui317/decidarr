import { settingsTestTmdbBodySchema, tmdbTestResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { createLogger } from '@/lib/logger';
import { TMDbService } from '@/lib/services/tmdb';

const logger = createLogger('API:TestTmdb');

// POST /api/settings/test-tmdb - Test TMDB API key
// Admin-only (spec #18 story 38): an unauthenticated caller must not get a free TMDb key
// oracle. The wizard's TMDb step runs after Plex sign-in, which already issued the Admin's
// session cookie, so this needs no pre-setup public path.
export const POST = route(
  { access: 'admin', body: settingsTestTmdbBodySchema, response: tmdbTestResponseSchema },
  async ({ body, reply }) => {
    const { apiKey } = body;

    logger.debug('Testing TMDB API key');
    const result = await new TMDbService(apiKey.trim()).testApiKey();

    if (!result.valid) {
      logger.warn('TMDB API key invalid');
      return reply({ valid: false, error: 'Invalid TMDB API key' });
    }

    logger.info('TMDB API key valid');
    return reply({
      valid: true,
      message: 'TMDB API key is valid',
      imageBaseUrl: result.imageBaseUrl,
    });
  }
);
