import { route } from '@/lib/request/route';
import { errorReply } from '@/lib/request/reply';
import { DomainError } from '@/lib/request/errors';
import { getChanges } from '@/lib/sync/service';
import { SYNC_SCHEMA_VERSION, syncChangesQuerySchema, syncChangesResponseSchema } from '@decidarr/api-contracts';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:SyncChanges');

export const GET = route(
  { access: 'user', query: syncChangesQuerySchema, response: syncChangesResponseSchema },
  async ({ session, query, reply }) => {
    if (session.credential !== 'bearer') {
      throw new DomainError('UNAUTHENTICATED');
    }

    const cursor = query.cursor ?? null;
    const rawLimit = parseInt(query.limit ?? '100', 10);
    const limit = Math.max(1, Math.min(500, Number.isNaN(rawLimit) ? 100 : rawLimit));

    try {
      const { changes, nextCursor, hasMore } = await getChanges(session.userId, cursor, limit);

      return reply({
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
        return errorReply(410, { error: 'full_resync_required' });
      }
      logger.error('Sync changes failed', { error: msg });
      return errorReply(500, { error: 'Failed to fetch changes' });
    }
  }
);
