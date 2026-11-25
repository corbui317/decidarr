import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { getLegacyMasterKey } from '@/lib/secrets';

/**
 * Test-only: seed a legacy (pre-DECIDARR_SECRET) install, then boot it the way
 * a restart after the upgrade would, so the secret migration runs before the
 * next request. Same guards as /api/test/reset.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_MOCK_PLEX !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const resetSecret = process.env.E2E_TEST_RESET_SECRET?.trim();
  if (!resetSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const provided = request.headers.get('X-E2E-Reset-Secret')?.trim();
  if (!provided || provided !== resetSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { seedLegacyInstall } = await import('../../../../../tests/helpers/legacy-install-seed');

    await connectDB();
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not ready');
    }

    // The legacy install derived its master key from MONGODB_URI; this process
    // sees the same URI as the migration that will read the data back.
    const { adminUserId } = await seedLegacyInstall(db, getLegacyMasterKey());

    // Upgrading means restarting with DECIDARR_SECRET set: forget the cached
    // connection and migration state, then take the boot path (connect, migrate).
    forgetConnectionForTests();
    resetMigrationStateForTests();
    await connectDB();

    return NextResponse.json({ ok: true, adminUserId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
