import { NextResponse } from 'next/server';
import type { AwardCategoriesResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { TMDbService } from '@/lib/services/tmdb';

export const GET = route({ access: 'public' }, async () => {
  const tmdbApiKey = process.env.TMDB_API_KEY || 'dummy';

  const tmdbService = new TMDbService(tmdbApiKey);
  const categories = tmdbService.getRatingCategories();

  const response: AwardCategoriesResponse = { categories };
  return NextResponse.json(response);
});
