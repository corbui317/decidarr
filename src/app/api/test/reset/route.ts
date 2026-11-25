import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { clearRateLimitStore } from '@/lib/security/rate-limit';

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
    await connectDB();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }

    // An empty database should behave like a fresh install on a fresh process.
    forgetConnectionForTests();
    resetMigrationStateForTests();
    clearRateLimitStore();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
