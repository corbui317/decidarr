import { NextResponse } from 'next/server';
import { syncMutationsBodySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { applyMutations, validateMutationBatch } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SyncMutations');

export const POST = route({ access: 'user', body: syncMutationsBodySchema }, async ({ session, body }) => {
  if (session.credential !== 'bearer') {
    throw new DomainError('UNAUTHENTICATED');
  }

  let mutations;
  try {
    mutations = validateMutationBatch(body.mutations);
  } catch (err) {
    throw new DomainError('VALIDATION_FAILED', (err as Error).message);
  }

  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED');
  }

  try {
    const result = await applyMutations(user, mutations);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Sync mutations failed', { error: (error as Error)?.message });
    throw error;
  }
});
