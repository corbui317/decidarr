import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, requireAdminSession } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';

const bodyContract = z.object({ tmdbApiKey: z.string().optional() });

/** Save optional TMDB key after OAuth setup, or update integration keys during admin reconfigure */
export const POST = route({ access: 'public', body: bodyContract }, async ({ request, body }) => {
  const settings = await getOrCreateSettings();
  const { tmdbApiKey } = body;

  if (settings.setupComplete) {
    await requireAdminSession(request);
    if (tmdbApiKey) {
      settings.tmdbApiKey = tmdbApiKey;
      await settings.save();
    }
    return NextResponse.json({ success: true, message: 'Settings updated' });
  }

  return NextResponse.json(
    {
      error: 'Complete setup by signing in with Plex.',
      useOAuth: true,
    },
    { status: 400 }
  );
});
