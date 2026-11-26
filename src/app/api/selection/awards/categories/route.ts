import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { TMDbService } from '@/lib/services/tmdb';

export const GET = route({ access: 'public' }, async () => {
  const tmdbApiKey = process.env.TMDB_API_KEY || 'dummy';

  const tmdbService = new TMDbService(tmdbApiKey);
  const categories = tmdbService.getRatingCategories();

  return NextResponse.json({ categories });
});
