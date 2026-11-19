import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { loadUserWithToken } from '@/lib/models/User';
import { isSetupSecretRequired, getConfiguredSetupSecret } from '@/lib/security/setup-secret';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SettingsStatus');

async function hasUsablePlexToken(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>
): Promise<boolean> {
  const legacyToken = settings.getDecryptedPlexToken();
  logger.info('[DEBUG] hasUsablePlexToken check', {
    hasSettingsToken: !!settings.plexToken,
    legacyTokenDecrypted: !!legacyToken,
    hasAdminUserId: !!settings.adminUserId,
    adminUserId: settings.adminUserId?.toString(),
  });
  if (legacyToken) return true;

  if (!settings.adminUserId) return false;

  const adminUser = await loadUserWithToken(settings.adminUserId);
  logger.info('[DEBUG] Admin user check', {
    adminUserFound: !!adminUser,
    hasAdminToken: !!adminUser?.plexToken,
  });
  if (!adminUser) return false;

  try {
    const decryptedToken = adminUser.getDecryptedToken();
    logger.info('[DEBUG] Admin token decryption', {
      tokenDecrypted: !!decryptedToken,
    });
    return !!decryptedToken;
  } catch (err) {
    logger.error('[DEBUG] Admin token decryption failed', { error: String(err) });
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

    logger.info('[DEBUG] Status API result', {
      dbSetupComplete: settings.setupComplete,
      hasPlexToken,
      hasPlexServer,
      finalSetupComplete: setupComplete,
      migrationVersion: settings.secretsMigrationVersion,
    });

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
