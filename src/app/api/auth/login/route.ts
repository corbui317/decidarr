import { apiErrorBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';

/** @deprecated Use POST /api/auth/plex/start instead */
export const POST = route(
  {
    access: 'public',
    // Never succeeds: every reply is the 410 below, so the error contract is its only shape.
    response: apiErrorBodySchema,
    // Well above household use: this route always 410s, but still shares the same bounded,
    // unspoofable policy as every other sign-in route so it cannot become an unlimited bucket.
    rateLimit: { scope: 'auth:login', windowMs: 15 * 60 * 1000, maxAttempts: 5, globalMaxAttempts: 50 },
  },
  async ({ reply }) => {
    return errorReply(410, { error: 'Please use Plex OAuth to log in.' });
  }
);
