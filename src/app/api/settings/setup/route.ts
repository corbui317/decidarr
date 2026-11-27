import { NextResponse } from 'next/server';
import { settingsSetupBodySchema, type SettingsSetupResponse } from '@decidarr/api-contracts';
import { route, requireAdminSession } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';

/** Save optional TMDB key after OAuth setup, or update integration keys during admin reconfigure */
export const POST = route({ access: 'public', body: settingsSetupBodySchema }, async ({ request, body }) => {
  const settings = await getOrCreateSettings();
  const { tmdbApiKey } = body;

  if (settings.setupComplete) {
    await requireAdminSession(request);
    if (tmdbApiKey) {
      settings.tmdbApiKey = tmdbApiKey;
      await settings.save();
    }
    const response: SettingsSetupResponse = { success: true, message: 'Settings updated' };
    return NextResponse.json(response);
  }

  return NextResponse.json(
    {
      error: 'Complete setup by signing in with Plex.',
      useOAuth: true,
    },
    { status: 400 }
  );
});
