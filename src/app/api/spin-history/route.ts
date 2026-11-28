import { route } from '@/lib/request/route';
import {
  spinHistoryClearAllResponseSchema,
  spinHistoryCreateBodySchema,
  spinHistoryCreateResponseSchema,
  spinHistoryListQuerySchema,
  spinHistoryListResponseSchema,
} from '@decidarr/api-contracts';
import { SpinHistoryEntry } from '@/lib/models/SpinHistoryEntry';
import { toSpinHistoryEntryResponse } from '@/lib/routes/spin-history-entry';
import { clearSpinHistory, recordSpin } from '@/lib/user-data';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route(
  { access: 'user', query: spinHistoryListQuerySchema, response: spinHistoryListResponseSchema },
  async ({ session, query, reply }) => {
    const { page, limit } = query;
    const filter = { userId: session.userId };
    const [items, total] = await Promise.all([
      SpinHistoryEntry.find(filter)
        .sort({ spunAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SpinHistoryEntry.countDocuments(filter),
    ]);

    return reply({ items: items.map(toSpinHistoryEntryResponse), total, page, pageSize: limit });
  }
);

export const POST = route(
  { access: 'user', body: spinHistoryCreateBodySchema, response: spinHistoryCreateResponseSchema },
  async ({ session, body, reply }) => {
    const { entry } = await recordSpin(session, body);
    if (!entry) {
      return reply({ skipped: true, reason: 'disabled' });
    }
    return reply({ entry: toSpinHistoryEntryResponse(entry) }, 201);
  }
);

export const DELETE = route({ access: 'user', response: spinHistoryClearAllResponseSchema }, async ({ session, reply }) => {
  return reply({ deleted: await clearSpinHistory(session) });
});
