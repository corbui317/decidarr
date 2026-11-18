import { createLogger } from '../logger';
import {
  buildOverseerrLookupKey,
  mapOverseerrMediaStatus,
  type OverseerrAvailability,
} from '@/types/overseerr';

const logger = createLogger('OverseerrService');
const FETCH_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;

export interface OverseerrMediaRecord {
  tmdbId: number;
  status: number;
  mediaType?: string;
}

export interface OverseerrStatusIndex {
  byKey: Map<string, OverseerrAvailability>;
  totalRecords: number;
}

export class OverseerrService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async fetchWithTimeout(path: string): Promise<Response> {
    const url = `${this.baseUrl}/api/v1${path}`;
    return fetch(url, {
      headers: {
        'X-Api-Key': this.apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string; version?: string }> {
    try {
      const response = await this.fetchWithTimeout('/status');
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      logger.info('Connection test successful', { version: data.version });
      return { success: true, version: data.version };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Connection test failed', { error: message });
      return { success: false, error: message };
    }
  }

  async fetchAllMediaStatus(): Promise<OverseerrStatusIndex> {
    const byKey = new Map<string, OverseerrAvailability>();
    let page = 0;
    let totalPages = 1;

    while (page < totalPages) {
      const response = await this.fetchWithTimeout(
        `/media?take=${PAGE_SIZE}&skip=${page * PAGE_SIZE}&filter=all&sort=added`
      );

      if (!response.ok) {
        throw new Error(`Overseerr media fetch failed: HTTP ${response.status}`);
      }

      const data = await response.json();
      const results = (data.results || []) as OverseerrMediaRecord[];
      const pageInfo = data.pageInfo as { pages?: number } | undefined;

      if (pageInfo?.pages != null) {
        totalPages = pageInfo.pages;
      } else if (results.length < PAGE_SIZE) {
        totalPages = page + 1;
      } else {
        totalPages = page + 2;
      }

      for (const record of results) {
        if (!record.tmdbId) continue;
        const mapped = mapOverseerrMediaStatus(record.status);
        if (!mapped) continue;

        const mediaType =
          record.mediaType === 'tv' || record.mediaType === 'movie'
            ? record.mediaType
            : 'movie';

        const decidarrType = mediaType === 'tv' ? 'show' : 'movie';
        const key = buildOverseerrLookupKey(decidarrType, record.tmdbId);
        byKey.set(key, mapped);
      }

      page += 1;
    }

    logger.debug('Built Overseerr status index', { entries: byKey.size });
    return { byKey, totalRecords: byKey.size };
  }
}
