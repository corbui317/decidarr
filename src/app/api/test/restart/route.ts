import { NextResponse } from 'next/server';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { route } from '@/lib/request/route';

/**
 * Test-only: boot the data now in the database the way a server restart
 * would (fresh connection, migrations not yet run), so an E2E spec can seed a
 * legacy install and then upgrade it. Same guards as /api/test/reset.
 */
export const POST = route({ access: 'public' }, async ({ request }) => {
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
    forgetConnectionForTests();
    resetMigrationStateForTests();
    await connectDB();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
});
