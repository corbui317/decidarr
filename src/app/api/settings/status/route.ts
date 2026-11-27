import { NextResponse } from 'next/server';
import type { SettingsStatusResponse } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { isSetupSecretRequired, getConfiguredSetupSecret } from '@/lib/security/setup-secret';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

async function hasUsablePlexToken(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>
): Promise<boolean> {
  const legacyToken = settings.getDecryptedPlexToken();
  if (legacyToken) return true;

  if (!settings.adminUserId) return false;

  const adminUser = await User.findById(settings.adminUserId);
  if (!adminUser) return false;

  try {
    return !!adminUser.getDecryptedToken();
  } catch {
    return false;
  }
}

// GET /api/settings/status - Check if app is configured (public endpoint)
export const GET = route({ access: 'public' }, async () => {
  const settings = await getOrCreateSettings();

  const hasPlexToken = await hasUsablePlexToken(settings);
  const hasPlexServer = !!settings.plexServerUrl;
  const setupComplete = settings.setupComplete && hasPlexToken && hasPlexServer;

  const response: SettingsStatusResponse = {
    setupComplete,
    hasPlexToken,
    hasPlexServer,
    hasTmdbKey: !!settings.getDecryptedTmdbKey(),
    setupSecretRequired: !setupComplete && isSetupSecretRequired() && !!getConfiguredSetupSecret(),
  };
  return NextResponse.json(response);
});
