import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { getOverseerrConfig, requireUser, isAuthError, authErrorStatus } from '@/lib/auth';
import { OverseerrService } from '@/lib/services/overseerr';

export async function GET() {
  try {
    await requireUser();
    await connectDB();
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
      } catch {
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
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    console.error('Overseerr status error:', error);
    return NextResponse.json({ error: 'Failed to get Overseerr status' }, { status: 500 });
  }
}
