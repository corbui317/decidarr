import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { getLegacyMasterKey } from '@/lib/models/Settings';
import { createLegacyEncryptedData } from '../../../../../tests/helpers/legacy-encryption';
import { User } from '@/lib/models/User';

/**
 * Test-only endpoint to seed legacy-encrypted data for migration testing.
 * This endpoint is behind the same guards as the reset endpoint.
 */
export async function POST(request: Request) {
  // Guard: only available in E2E mock mode
  if (process.env.NODE_ENV === 'production' || process.env.E2E_MOCK_PLEX !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Guard: require reset secret
  const resetSecret = process.env.E2E_TEST_RESET_SECRET?.trim();
  if (!resetSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const provided = request.headers.get('X-E2E-Reset-Secret')?.trim();
  if (!provided || provided !== resetSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();

    // Get the legacy master key (without DECIDARR_SECRET)
    const legacyMasterKey = getLegacyMasterKey();

    // Create legacy-encrypted data
    const legacyData = createLegacyEncryptedData(legacyMasterKey);

    // Create settings with legacy encryption (pre-migration format)
    const settings = await mongoose.connection.db?.collection('settings').findOneAndUpdate(
      { _id: 'app-settings' },
      {
        $set: {
          _id: 'app-settings',
          jwtSecret: legacyData.jwtSecret,
          encryptionKey: legacyData.encryptionKey,
          plexToken: legacyData.plexToken,
          plexServerUrl: 'http://192.168.1.10:32400',
          plexUsername: 'legacyuser',
          plexMachineId: 'legacy-machine-1',
          tmdbApiKey: legacyData.tmdbApiKey,
          tautulliEnabled: false,
          overseerrFilterEnabled: false,
          syncFrequencyHours: 24,
          setupComplete: true, // Setup already complete so we can test login and spin
          approvedPlexUserIds: [],
          uiPreferences: {
            theme: 'dark',
            defaultMediaType: 'movie',
            tvSelectionMode: 'show',
            animationStyle: 'slots',
            animationSpeed: 'normal',
          },
          spinHistoryPreferences: {
            enabled: true,
            retentionLimit: 50,
            storeFilterSnapshot: true,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Create a legacy admin user
    const userId = new mongoose.Types.ObjectId();
    await User.create({
      _id: userId,
      plexUserId: 'legacy-plex-user-1',
      plexUsername: 'legacyuser',
      plexToken: legacyData.plexToken, // Same token as settings for this test
      isAdmin: true,
      isApproved: true,
      sessionVersion: 0,
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update settings to reference this admin user
    await mongoose.connection.db?.collection('settings').updateOne(
      { _id: 'app-settings' },
      { $set: { adminUserId: userId } }
    );

    // Seed a library cache entry so spinning is possible
    await mongoose.connection.db?.collection('librarycaches').insertOne({
      plexMachineId: 'legacy-machine-1',
      libraryId: '1',
      libraryName: 'Movies',
      mediaType: 'movie',
      items: [
        {
          plexId: 'movie-1',
          title: 'Test Movie',
          year: 2020,
          thumbPath: '/library/metadata/1/thumb',
          type: 'movie',
        },
        {
          plexId: 'movie-2',
          title: 'Another Movie',
          year: 2021,
          thumbPath: '/library/metadata/2/thumb',
          type: 'movie',
        },
      ],
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Reset migration state so it runs on next connection
    resetMigrationStateForTests();

    return NextResponse.json({
      ok: true,
      userId: userId.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
