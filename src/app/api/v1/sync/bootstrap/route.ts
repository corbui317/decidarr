import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireMobileUser } from '@/lib/mobile-auth/context';
import { isAuthError, authErrorStatus } from '@/lib/auth';
import { buildBootstrap, backfillSyncRevisions } from '@/lib/sync/service';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SyncBootstrap');

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const auth = await requireMobileUser(request);
    await backfillSyncRevisions(auth.user._id);

    const bootstrap = await buildBootstrap(auth.user);
    return NextResponse.json(bootstrap);
  } catch (error) {
    const msg = (error as Error)?.message;
    if (isAuthError(error) || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg || 'Unauthorized' }, { status: 401 });
    }
    logger.error('Sync bootstrap failed', { error: msg });
    return NextResponse.json({ error: 'Failed to bootstrap sync' }, { status: 500 });
  }
}
