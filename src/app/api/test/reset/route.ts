import mongoose from 'mongoose';
import { connectDB, forgetConnectionForTests } from '@/lib/db';
import { resetMigrationStateForTests } from '@/lib/migrate';
import { clearRateLimitStore } from '@/lib/security/rate-limit';
import { okResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';

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
    await connectDB();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
    }

    // An empty database should behave like a fresh install on a fresh process.
    forgetConnectionForTests();
    resetMigrationStateForTests();
    clearRateLimitStore();

    return reply({ ok: true as const });
  } catch (error) {
    return errorReply(500, { error: (error as Error).message });
  }
});
