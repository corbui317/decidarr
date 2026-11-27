import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getChanges } from '@/lib/sync/service';
import { SYNC_SCHEMA_VERSION } from '@decidarr/api-contracts';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:SyncChanges');

const queryContract = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const GET = route({ access: 'user', query: queryContract }, async ({ session, query }) => {
  if (session.credential !== 'bearer') {
    throw new DomainError('UNAUTHENTICATED');
  }

  const cursor = query.cursor ?? null;
  const rawLimit = parseInt(query.limit ?? '100', 10);
  const limit = Math.max(1, Math.min(500, Number.isNaN(rawLimit) ? 100 : rawLimit));

  try {
    const { changes, nextCursor, hasMore } = await getChanges(session.userId, cursor, limit);

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
    logger.error('Sync changes failed', { error: msg });
    return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
  }
});
