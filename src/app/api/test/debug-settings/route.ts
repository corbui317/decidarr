import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';

export async function GET() {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_MOCK_PLEX !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await connectDB();
    const settings = await getOrCreateSettings();

    // Try to decrypt various fields
    let encryptionKeyDecrypted = null;
    let encryptionKeyError = null;
    try {
      encryptionKeyDecrypted = settings.getEncryptionKey();
    } catch (err) {
      encryptionKeyError = String(err);
    }

    let plexTokenDecrypted = null;
    let plexTokenError = null;
    try {
      plexTokenDecrypted = settings.getDecryptedPlexToken();
    } catch (err) {
      plexTokenError = String(err);
    }

    // Load admin user if exists
    let adminUser = null;
    let adminUserToken = null;
    let adminUserTokenError = null;
    if (settings.adminUserId) {
      adminUser = await User.findById(settings.adminUserId);
      if (adminUser) {
        try {
          adminUserToken = adminUser.getDecryptedToken();
        } catch (err) {
          adminUserTokenError = String(err);
        }
      }
    }

    return NextResponse.json({
      settings: {
        setupComplete: settings.setupComplete,
        hasPlexToken: !!settings.plexToken,
        plexTokenFormat: settings.plexToken?.substring(0, 10) + '...',
        plexServerUrl: settings.plexServerUrl,
        hasEncryptionKey: !!settings.encryptionKey,
        encryptionKeyFormat: settings.encryptionKey?.substring(0, 10) + '...',
        secretsMigrationVersion: settings.secretsMigrationVersion,
        adminUserId: settings.adminUserId?.toString(),
      },
      decryption: {
        encryptionKeyDecrypted: !!encryptionKeyDecrypted,
        encryptionKeyError,
        plexTokenDecrypted: !!plexTokenDecrypted,
        plexTokenError,
      },
      adminUser: adminUser ? {
        exists: true,
        hasPlexToken: !!adminUser.plexToken,
        plexTokenFormat: adminUser.plexToken?.substring(0, 10) + '...',
        adminUserTokenDecrypted: !!adminUserToken,
        adminUserTokenError,
      } : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message, stack: (error as Error).stack },
      { status: 500 }
    );
  }
}
