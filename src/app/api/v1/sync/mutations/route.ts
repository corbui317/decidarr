import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireMobileUser } from '@/lib/mobile-auth/context';
import { isAuthError } from '@/lib/auth';
import { applyMutations, validateMutationBatch } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SyncMutations');

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const auth = await requireMobileUser(request);
    const body = await request.json();

    if (!body || typeof body !== 'object' || !Array.isArray(body.mutations)) {
      return NextResponse.json({ error: 'mutations array is required' }, { status: 400 });
    }

    let mutations;
    try {
      mutations = validateMutationBatch(body.mutations);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }

    const result = await applyMutations(auth.user, mutations);
    return NextResponse.json(result);
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error) || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg || 'Unauthorized' }, { status: 401 });
    }
    logger.error('Sync mutations failed', { error: msg });
    return NextResponse.json({ error: 'Failed to apply mutations' }, { status: 500 });
  }
}
