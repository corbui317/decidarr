import { createLogger } from '../logger';

const logger = createLogger('TautulliService');
const FETCH_TIMEOUT_MS = 10_000;

export interface TautulliUser {
  user_id: number;
  username: string;
  friendly_name: string;
  thumb: string;
}

export interface TautulliWatchedItem {
  rating_key: string;
  title: string;
  year: number;
  media_type: 'movie' | 'show' | 'episode';
  last_watched: number;
  play_count: number;
  user_id: number;
  username: string;
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

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

export class TautulliService {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private buildUrl(cmd: string, params: Record<string, string | number> = {}): string {
    const url = new URL(`${this.baseUrl}/api/v2`);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('cmd', cmd);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = this.buildUrl('get_tautulli_info');
      const response = await fetchWithTimeout(url);
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
      const url = this.buildUrl('get_users');
      const response = await fetchWithTimeout(url);
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
    length: number = 500
  ): Promise<TautulliHistoryItem[]> {
    try {
      const params: Record<string, string | number> = { length };
      if (userId !== undefined) params.user_id = userId;
      if (mediaType) params.media_type = mediaType;

      const url = this.buildUrl('get_history', params);
      const response = await fetchWithTimeout(url);
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

      logger.debug('Fetched watch history', { count: history.length, userId, mediaType });
      return history;
    } catch (err) {
      logger.error('Failed to get watch history', { error: (err as Error).message });
      return [];
    }
  }

  async getWatchedItemsForUser(
    userId: number,
    mediaType?: 'movie' | 'show'
  ): Promise<Map<string, TautulliHistoryItem>> {
    const history = await this.getWatchHistory(userId, mediaType, 1000);
    const watchedMap = new Map<string, TautulliHistoryItem>();

    for (const item of history) {
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

    logger.debug('Built watched map', { userId, uniqueItems: watchedMap.size });
    return watchedMap;
  }

  async getUserIdByPlexUsername(plexUsername: string): Promise<number | null> {
    const users = await this.getUsers();
    const match = users.find(
      u => u.username.toLowerCase() === plexUsername.toLowerCase() ||
           u.friendly_name.toLowerCase() === plexUsername.toLowerCase()
    );
    return match?.user_id ?? null;
  }
}
