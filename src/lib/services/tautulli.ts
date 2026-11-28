import { createLogger } from '../logger';
import { createIntegrationClient, type IntegrationClient } from '../integrations/client';

const logger = createLogger('TautulliService');
const TAUTULLI_TIMEOUT_MS = 10_000;

export interface TautulliUser {
  user_id: number;
  username: string;
  friendly_name: string;
  thumb: string;
}

export interface TautulliHistoryItem {
  reference_id: number;
  rating_key: string;
  parent_rating_key?: string;
  grandparent_rating_key?: string;
  title: string;
  grandparent_title?: string;
  year: number;
  media_type: 'movie' | 'episode';
  watched_status: number;
  stopped: number;
  user_id: number;
  user: string;
}

export class TautulliService {
  private client: IntegrationClient;

  constructor(baseUrl: string, apiKey: string) {
    this.client = createIntegrationClient({
      integration: 'Tautulli',
      baseUrl,
      auth: { query: 'apikey', value: apiKey },
      timeoutMs: TAUTULLI_TIMEOUT_MS,
    });
  }

  private command(cmd: string, params: Record<string, string | number> = {}): Promise<Response> {
    return this.client.request('/api/v2', { query: { cmd, ...params } });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.command('get_tautulli_info');
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      const data = await response.json();
      if (data.response?.result !== 'success') {
        return { success: false, error: data.response?.message || 'Unknown error' };
      }
      logger.info('Connection test successful', { version: data.response?.data?.tautulli_version });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Connection test failed', { error: message });
      return { success: false, error: message };
    }
  }

  async getUsers(): Promise<TautulliUser[]> {
    try {
      const response = await this.command('get_users');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.response?.result !== 'success') {
        throw new Error(data.response?.message || 'Failed to get users');
      }

      const users = (data.response?.data || []).map((u: Record<string, unknown>) => ({
        user_id: u.user_id as number,
        username: u.username as string,
        friendly_name: u.friendly_name as string,
        thumb: u.thumb as string,
      }));
      logger.debug('Fetched users', { count: users.length });
      return users;
    } catch (err) {
      logger.error('Failed to get users', { error: (err as Error).message });
      return [];
    }
  }

  async getWatchHistory(
    userId?: number,
    mediaType?: 'movie' | 'show' | 'episode',
    length: number = 500,
    strict: boolean = false,
    start: number = 0
  ): Promise<TautulliHistoryItem[]> {
    try {
      const params: Record<string, string | number> = { length, start };
      if (userId !== undefined) params.user_id = userId;
      if (mediaType) params.media_type = mediaType;

      const response = await this.command('get_history', params);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.response?.result !== 'success') {
        throw new Error(data.response?.message || 'Failed to get history');
      }

      const history: TautulliHistoryItem[] = (data.response?.data?.data || [])
        .filter((h: Record<string, unknown>) => h.watched_status === 1)
        .map((h: Record<string, unknown>) => ({
          reference_id: h.reference_id as number,
          rating_key: String(h.rating_key),
          parent_rating_key: h.parent_rating_key ? String(h.parent_rating_key) : undefined,
          grandparent_rating_key: h.grandparent_rating_key ? String(h.grandparent_rating_key) : undefined,
          title: h.title as string,
          grandparent_title: h.grandparent_title as string | undefined,
          year: h.year as number,
          media_type: h.media_type as 'movie' | 'episode',
          watched_status: h.watched_status as number,
          stopped: h.stopped as number,
          user_id: h.user_id as number,
          user: h.user as string,
        }));

      logger.debug('Fetched watch history', { count: history.length, userId, mediaType, start });
      return history;
    } catch (err) {
      logger.error('Failed to get watch history', { error: (err as Error).message });
      if (strict) throw err;
      return [];
    }
  }

  async getWatchHistoryPaged(
    userId: number,
    mediaType: 'movie' | 'episode',
    pageSize: number = 500
  ): Promise<TautulliHistoryItem[]> {
    const all: TautulliHistoryItem[] = [];
    let start = 0;

    while (true) {
      const page = await this.getWatchHistory(userId, mediaType, pageSize, true, start);
      all.push(...page);
      if (page.length < pageSize) break;
      start += pageSize;
    }

    return all;
  }

  dedupeWatchHistory(items: TautulliHistoryItem[]): Map<string, TautulliHistoryItem> {
    const watchedMap = new Map<string, TautulliHistoryItem>();

    for (const item of items) {
      if (item.media_type === 'movie') {
        const existing = watchedMap.get(item.rating_key);
        if (!existing || item.stopped > existing.stopped) {
          watchedMap.set(item.rating_key, item);
        }
      } else if (item.media_type === 'episode' && item.grandparent_rating_key) {
        const existing = watchedMap.get(item.grandparent_rating_key);
        if (!existing || item.stopped > existing.stopped) {
          watchedMap.set(item.grandparent_rating_key, item);
        }
      }
    }

    return watchedMap;
  }

  async getWatchedItemsForUser(
    userId: number,
    mediaType?: 'movie' | 'show'
  ): Promise<Map<string, TautulliHistoryItem>> {
    const movieHistory = mediaType === 'show'
      ? []
      : await this.getWatchHistoryPaged(userId, 'movie');
    const episodeHistory = mediaType === 'movie'
      ? []
      : await this.getWatchHistoryPaged(userId, 'episode');

    const watchedMap = this.dedupeWatchHistory([...movieHistory, ...episodeHistory]);
    logger.debug('Built watched map', { userId, uniqueItems: watchedMap.size });
    return watchedMap;
  }

  /** Tautulli's user_id is the Plex account id for a Plex-synced user. */
  async getUserIdByPlexId(plexUserId: number): Promise<number | null> {
    const users = await this.getUsers();
    const match = users.find(u => u.user_id === plexUserId);
    return match?.user_id ?? null;
  }
}
