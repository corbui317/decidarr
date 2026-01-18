import { NextResponse } from 'next/server';
import { TMDbService } from '@/lib/services/tmdb';

export async function GET() {
  const tmdbApiKey = process.env.TMDB_API_KEY || 'dummy';

  const tmdbService = new TMDbService(tmdbApiKey);
  const categories = tmdbService.getRatingCategories();

  return NextResponse.json({ categories });
}
