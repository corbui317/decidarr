import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { getOverseerrConfig } from '@/lib/auth';
import { OverseerrService } from '@/lib/services/overseerr';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:OverseerrStatus');

export const GET = route({ access: 'user' }, async () => {
  const config = await getOverseerrConfig();
  const settings = await getOrCreateSettings();

  if (!config.configured) {
    return NextResponse.json({
      configured: false,
      reachable: null,
      filterEnabled: false,
      lastSyncAt: null,
      lastSyncOk: true,
      warning: null,
    });
  }

  let reachable = config.lastSyncOk;
  if (config.url && config.apiKey) {
    try {
      const service = new OverseerrService(config.url, config.apiKey);
      const test = await service.testConnection();
      reachable = test.success;
    } catch (err) {
      logger.warn('Overseerr connection test failed', { error: (err as Error).message });
      reachable = false;
    }
  }

  const warning =
    config.filterEnabled && !reachable
      ? 'Overseerr is unavailable. Using the last cached availability data.'
      : !config.lastSyncOk
        ? 'The last Overseerr sync failed. Using the last cached availability data.'
        : null;

  return NextResponse.json({
    configured: true,
    reachable,
    filterEnabled: config.filterEnabled,
    lastSyncAt: settings.overseerrLastSyncAt || null,
    lastSyncOk: settings.overseerrLastSyncOk ?? true,
    warning,
  });
});
