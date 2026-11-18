import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireMobileUser } from '@/lib/mobile-auth/context';
import { isAuthError } from '@/lib/auth';
import { getChanges } from '@/lib/sync/service';
import { SYNC_SCHEMA_VERSION } from '@decidarr/api-contracts';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:SyncChanges');

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const auth = await requireMobileUser(request);

    const cursor = request.nextUrl.searchParams.get('cursor');
    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '100', 10);
    const limit = Math.max(1, Math.min(500, Number.isNaN(rawLimit) ? 100 : rawLimit));

    const { changes, nextCursor, hasMore } = await getChanges(
      auth.user._id,
      cursor,
      limit
    );

    return NextResponse.json({
      schemaVersion: SYNC_SCHEMA_VERSION,
      changes,
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    const msg = (error as Error)?.message;
    const statusCode = (error as Error & { statusCode?: number }).statusCode;

    if (statusCode === 410 || msg === 'full_resync_required') {
      return NextResponse.json({ error: 'full_resync_required' }, { status: 410 });
    }
    if (isAuthError(error) || msg === 'Unauthorized') {
      return NextResponse.json({ error: msg || 'Unauthorized' }, { status: 401 });
    }
    logger.error('Sync changes failed', { error: msg });
    return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
  }
}
