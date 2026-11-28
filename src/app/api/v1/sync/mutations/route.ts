import { syncMutationBatchResponseSchema, syncMutationsBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { applyMutations } from '@/lib/sync/service';

export const POST = route(
  { access: 'user', body: syncMutationsBodySchema, response: syncMutationBatchResponseSchema },
  async ({ session, body, reply }) => {
    if (session.credential !== 'bearer') {
      throw new DomainError('UNAUTHENTICATED');
    }

    const user = await User.findById(session.userId);
    if (!user) {
      throw new DomainError('UNAUTHENTICATED');
    }

    return reply(await applyMutations(user, body.mutations));
  }
);
