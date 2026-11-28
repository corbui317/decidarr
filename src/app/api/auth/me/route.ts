import { authMeResponseSchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { User } from '@/lib/models/User';
import { DomainError } from '@/lib/request/errors';
import { toPreferenceContract } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user', response: authMeResponseSchema }, async ({ session, reply }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED', 'Unauthorized');
  }

  return reply({
    user: {
      id: user._id.toString(),
      username: user.plexUsername || user.plexUserId,
      thumb: user.plexThumb,
      isAdmin: session.isAdmin,
    },
    preferences: toPreferenceContract(user),
    expiresAt: session.expiresAt,
  });
});
