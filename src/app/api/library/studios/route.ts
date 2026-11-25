import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { TMDbService } from '@/lib/services/tmdb';

export const GET = route({ access: 'public' }, async () => {
  const tmdbService = new TMDbService('dummy');
  const studios = tmdbService.getPopularStudios();

  return NextResponse.json({ studios });
});
