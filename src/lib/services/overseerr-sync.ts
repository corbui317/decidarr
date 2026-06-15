import { createLogger } from '../logger';
import type { ISettings } from '../models/Settings';
import type { ILibraryItem } from '../models/LibraryCache';
import { OverseerrService } from './overseerr';
import { buildOverseerrLookupKey } from '@/types/overseerr';

const logger = createLogger('OverseerrSync');

export interface OverseerrSyncResult {
  ok: boolean;
  error?: string;
  matched?: number;
  withTmdbId?: number;
}

export async function enrichWithOverseerr(
  items: ILibraryItem[],
  mediaType: 'movie' | 'show',
  settings: ISettings,
  existingItems?: ILibraryItem[]
): Promise<OverseerrSyncResult> {
  const url = settings.overseerrUrl;
  const apiKey = settings.getDecryptedOverseerrKey();

  if (!url || !apiKey) {
    return { ok: true };
  }

  const existingByPlexId = new Map(
    (existingItems || []).map((item) => [item.plexId, item])
  );

  try {
    const service = new OverseerrService(url, apiKey);
    const index = await service.fetchAllMediaStatus();

    const syncedAt = new Date();
    let matched = 0;
    let withTmdbId = 0;

    for (const item of items) {
      if (!item.tmdbId) continue;
      withTmdbId += 1;

      const key = buildOverseerrLookupKey(mediaType, item.tmdbId);
      const status = index.byKey.get(key);

      if (status) {
        item.overseerrStatus = status;
        item.overseerrSyncedAt = syncedAt;
        matched += 1;
      } else {
        delete item.overseerrStatus;
        item.overseerrSyncedAt = syncedAt;
      }
    }

    settings.overseerrLastSyncAt = syncedAt;
    settings.overseerrLastSyncOk = true;
    settings.overseerrLastSyncError = undefined;
    await settings.save();

    logger.info('Overseerr enrichment complete', {
      mediaType,
      itemCount: items.length,
      withTmdbId,
      matched,
      indexSize: index.totalRecords,
    });

    return { ok: true, matched, withTmdbId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn('Overseerr sync failed; keeping prior statuses', { error: message });

    settings.overseerrLastSyncAt = new Date();
    settings.overseerrLastSyncOk = false;
    settings.overseerrLastSyncError = message.substring(0, 500);
    await settings.save();

    for (const item of items) {
      const prior = existingByPlexId.get(item.plexId);
      if (prior?.overseerrStatus) {
        item.overseerrStatus = prior.overseerrStatus;
        item.overseerrSyncedAt = prior.overseerrSyncedAt;
      }
    }

    return { ok: false, error: message };
  }
}
