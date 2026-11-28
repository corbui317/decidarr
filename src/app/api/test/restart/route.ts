import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { okResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';

/**
 * Test-only: boot the data now in the database the way a server restart
 * would (fresh connection, migrations not yet run), so an E2E spec can seed a
 * legacy install and then upgrade it. Same guards as /api/test/reset.
 */
export const POST = route({ access: 'public', response: okResponseSchema }, async ({ request, reply }) => {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_MOCK_PLEX !== 'true') {
    return errorReply(404, { error: 'Not found' });
  }

  const resetSecret = process.env.E2E_TEST_RESET_SECRET?.trim();
  if (!resetSecret) {
    return errorReply(403, { error: 'Forbidden' });
  }

  const provided = request.headers.get('X-E2E-Reset-Secret')?.trim();
  if (!provided || provided !== resetSecret) {
    return errorReply(403, { error: 'Forbidden' });
  }

  try {
    forgetConnectionForTests();
    resetMigrationStateForTests();
    await connectDB();
    return reply({ ok: true as const });
  } catch (error) {
    return errorReply(500, { error: (error as Error).message });
  }
});
