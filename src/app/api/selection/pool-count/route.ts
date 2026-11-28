import { route } from '@/lib/request/route';
import { getOverseerrConfig } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { loadPool } from '@/lib/selection/pool';
import { poolCountResultSchema, selectionRequestBodySchema } from '@decidarr/api-contracts';

export const POST = route(
  { access: 'user', body: selectionRequestBodySchema, response: poolCountResultSchema },
  async ({ session, body, reply }) => {
    const pool = await loadPool(session, body);
    const { breakdown, emptyReason } = pool.breakdown();

    let overseerrWarning: string | null = null;
    if (!pool.problem) {
      const [settings, overseerrConfig] = await Promise.all([getOrCreateSettings(), getOverseerrConfig()]);
      if (overseerrConfig.configured && settings.overseerrFilterEnabled && !overseerrConfig.lastSyncOk) {
        overseerrWarning = 'Overseerr is unavailable. Using the last cached availability data.';
      }
    }

    return reply({
      totalItems: pool.totalItems,
      matchingItems: pool.count,
      filterBreakdown: breakdown,
      emptyReason,
      dataStats: pool.dataStats,
      overseerrWarning,
    });
  }
);
