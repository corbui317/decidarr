import { NextResponse } from 'next/server';
import { TMDbService } from '@/lib/services/tmdb';

export async function GET() {
  const tmdbService = new TMDbService('dummy');
  const studios = tmdbService.getPopularStudios();

  return NextResponse.json({ studios });
}
