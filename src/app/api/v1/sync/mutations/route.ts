import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { User } from '@/lib/models/User';
import { applyMutations, validateMutationBatch } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SyncMutations');

const bodyContract = z.object({ mutations: z.array(z.unknown()) });

export const POST = route({ access: 'user', body: bodyContract }, async ({ session, body }) => {
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
