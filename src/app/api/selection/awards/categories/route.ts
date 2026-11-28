import { awardCategoriesResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { TMDbService } from '@/lib/services/tmdb';

export const GET = route({ access: 'public', response: awardCategoriesResponseSchema }, async ({ reply }) => {
  const tmdbApiKey = process.env.TMDB_API_KEY || 'dummy';

  const tmdbService = new TMDbService(tmdbApiKey);
  const categories = tmdbService.getRatingCategories();

  return reply({ categories });
});
