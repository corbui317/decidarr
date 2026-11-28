import { libraryStudiosResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { TMDbService } from '@/lib/services/tmdb';

export const GET = route({ access: 'public', response: libraryStudiosResponseSchema }, async ({ reply }) => {
  const tmdbService = new TMDbService('dummy');
  const studios = tmdbService.getPopularStudios();

  return reply({ studios });
});
