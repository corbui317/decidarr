import { NextResponse } from 'next/server';
import { syncMutationsBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { applyMutations } from '@/lib/sync/service';

export const POST = route({ access: 'user', body: syncMutationsBodySchema }, async ({ session, body }) => {
  if (session.credential !== 'bearer') {
    throw new DomainError('UNAUTHENTICATED');
  }

  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }

  return NextResponse.json(await applyMutations(user, body.mutations));
});
