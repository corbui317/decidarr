import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { isSetupSecretRequired, getConfiguredSetupSecret } from '@/lib/security/setup-secret';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:SettingsStatus');

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
export async function GET() {
  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    const hasPlexToken = await hasUsablePlexToken(settings);
    const hasPlexServer = !!settings.plexServerUrl;
    const setupComplete = settings.setupComplete && hasPlexToken && hasPlexServer;

    return NextResponse.json({
      setupComplete,
      hasPlexToken,
      hasPlexServer,
      hasTmdbKey: !!settings.getDecryptedTmdbKey(),
      setupSecretRequired: !setupComplete && isSetupSecretRequired() && !!getConfiguredSetupSecret(),
    });
  } catch (error) {
    logger.error('Settings status error', { error: (error as Error).message });
    return NextResponse.json(
      { error: 'Failed to get settings status', setupComplete: false },
      { status: 500 }
    );
  }
}
