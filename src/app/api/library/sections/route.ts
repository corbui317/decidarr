import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { PlexService } from '@/lib/services/plex';

export async function GET() {
  try {
    const { plexToken, plexServerUrl } = await requireAuth();

    const plexService = new PlexService(plexToken, plexServerUrl);
    const sections = await plexService.getLibrarySections();

    const mediaLibraries = sections.filter(
      (s) => s.type === 'movie' || s.type === 'show'
    );

    return NextResponse.json({ sections: mediaLibraries });
  } catch (error) {
    if ((error as Error).message === 'App not configured') {
      return NextResponse.json({ error: 'App not configured' }, { status: 401 });
    }
    console.error('Get sections error:', error);
    return NextResponse.json(
      { error: 'Failed to get library sections' },
      { status: 500 }
    );
  }
}
