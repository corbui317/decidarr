import { createLogger } from '../logger';

const logger = createLogger('PlexService');
const PLEX_TV_BASE = 'https://plex.tv';
const FETCH_TIMEOUT_MS = 15_000;

export interface PlexUser {
  id: string;
  username: string;
  email: string;
  thumb?: string;
}

export interface PlexServer {
  name: string;
  clientIdentifier: string;
  connections: { uri: string; local: boolean; relay: boolean }[];
}

export interface PlexLibrary {
  id: string;
  title: string;
  type: 'movie' | 'show';
  agent: string;
  scanner: string;
  language: string;
  uuid: string;
}

export interface PlexCollection {
  ratingKey: string;
  title: string;
  thumb?: string;
  childCount: number;
  addedAt?: Date;
}

export interface PlexItem {
  plexId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  art?: string;
  genres?: string[];
  summary?: string;
  rating?: number;
  duration?: number;
  contentRating?: string;
  studio?: string;
  addedAt?: Date;
  type?: string;
  seasonCount?: number;
  episodeCount?: number;
  tagline?: string;
  directors?: string[];
  actors?: string[];
  writers?: string[];
}

export class PlexService {
  private token: string;
  private serverUrl: string | null;
  private machineId: string | null;
  private headers: Record<string, string>;

  constructor(token: string, serverUrl: string | null = null, machineId: string | null = null) {
    this.token = token;
    this.serverUrl = serverUrl;
    this.machineId = machineId;
    this.headers = {
      'X-Plex-Token': token,
      Accept: 'application/json',
    };
  }

  private async fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  async validateToken(): Promise<{ valid: boolean; user?: PlexUser; error?: string }> {
    try {
      const response = await this.fetchWithTimeout(`${PLEX_TV_BASE}/api/v2/user`, {
        headers: {
          ...this.headers,
          'X-Plex-Client-Identifier': 'decidarr',
        },
      });

      if (!response.ok) {
        logger.warn('Token validation failed', { status: response.status });
        return { valid: false, error: 'Invalid token' };
      }

      const data = await response.json();
      logger.info('Token validated', { username: data.username });
      return {
        valid: true,
        user: {
          id: data.id,
          username: data.username,
          email: data.email,
          thumb: data.thumb,
        },
      };
    } catch (error) {
      logger.error('Token validation error', { error: (error as Error).message });
      return { valid: false, error: (error as Error).message };
    }
  }

  async getServers(): Promise<PlexServer[]> {
    const response = await this.fetchWithTimeout(`${PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error('Failed to get servers');
    }

    const data = await response.json();
    const servers = data.filter((r: Record<string, unknown>) => r.provides === 'server');

    logger.debug('Fetched servers', { count: servers.length });
    return servers.map((server: Record<string, unknown>) => ({
      name: server.name as string,
      clientIdentifier: server.clientIdentifier as string,
      connections: (server.connections as Record<string, unknown>[]).map((c) => ({
        uri: c.uri as string,
        local: c.local as boolean,
        relay: c.relay as boolean,
      })),
    }));
  }

  getMachineId(): string | null {
    return this.machineId;
  }

  setMachineId(machineId: string): void {
    this.machineId = machineId;
  }

  async getLibrarySections(): Promise<PlexLibrary[]> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    const response = await fetch(`${this.serverUrl}/library/sections`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error('Failed to get library sections');
    }

    const data = await response.json();
    const sections = data.MediaContainer?.Directory || [];

    return sections.map((section: any) => ({
      id: section.key,
      title: section.title,
      type: section.type,
      agent: section.agent,
      scanner: section.scanner,
      language: section.language,
      uuid: section.uuid,
    }));
  }

  async getLibraryItems(sectionId: string): Promise<PlexItem[]> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    const url = `${this.serverUrl}/library/sections/${sectionId}/all?X-Plex-Token=${this.token}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to get library items');
    }

    const data = await response.json();
    const items = data.MediaContainer?.Metadata || [];

    return items.map((item: any) => this.mapPlexItem(item));
  }

  async getItemMetadata(ratingKey: string): Promise<PlexItem> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    const response = await fetch(
      `${this.serverUrl}/library/metadata/${ratingKey}?X-Plex-Token=${this.token}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error('Failed to get item metadata');
    }

    const data = await response.json();
    const item = data.MediaContainer?.Metadata?.[0];
    return this.mapPlexItem(item, true);
  }

  async getShowEpisodes(showRatingKey: string): Promise<any[]> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    const response = await fetch(
      `${this.serverUrl}/library/metadata/${showRatingKey}/allLeaves?X-Plex-Token=${this.token}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      throw new Error('Failed to get show episodes');
    }

    const data = await response.json();
    const episodes = data.MediaContainer?.Metadata || [];

    return episodes.map((ep: any) => ({
      plexId: ep.ratingKey,
      title: ep.title,
      seasonNumber: ep.parentIndex,
      episodeNumber: ep.index,
      summary: ep.summary,
      duration: ep.duration,
      rating: ep.rating,
      thumb: ep.thumb ? `${this.serverUrl}${ep.thumb}?X-Plex-Token=${this.token}` : null,
    }));
  }

  private mapPlexItem(item: Record<string, unknown>, detailed = false): PlexItem {
    const base: PlexItem = {
      plexId: item.ratingKey as string,
      title: item.title as string,
      year: item.year as number | undefined,
      posterUrl: item.thumb ? `${this.serverUrl}${item.thumb}?X-Plex-Token=${this.token}` : undefined,
      genres: item.Genre ? (item.Genre as { tag: string }[]).map((g) => g.tag) : [],
      summary: item.summary as string | undefined,
      rating: item.rating as number | undefined,
      duration: item.duration as number | undefined,
      contentRating: item.contentRating as string | undefined,
      studio: item.studio as string | undefined,
      addedAt: item.addedAt ? new Date((item.addedAt as number) * 1000) : undefined,
      type: item.type as string | undefined,
    };

    if (item.type === 'show') {
      base.seasonCount = item.childCount as number;
      base.episodeCount = item.leafCount as number;
    }

    if (detailed) {
      base.art = item.art ? `${this.serverUrl}${item.art}?X-Plex-Token=${this.token}` : undefined;
      base.tagline = item.tagline as string | undefined;
      base.directors = item.Director ? (item.Director as { tag: string }[]).map((d) => d.tag) : [];
      base.actors = item.Role ? (item.Role as { tag: string }[]).slice(0, 10).map((r) => r.tag) : [];
      base.writers = item.Writer ? (item.Writer as { tag: string }[]).map((w) => w.tag) : [];
    }

    return base;
  }

  async getCollections(sectionId: string): Promise<PlexCollection[]> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    try {
      const url = `${this.serverUrl}/library/sections/${sectionId}/collections?X-Plex-Token=${this.token}`;
      const response = await this.fetchWithTimeout(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn('Failed to get collections', { sectionId, status: response.status });
        return [];
      }

      const data = await response.json();
      const collections = data.MediaContainer?.Metadata || [];

      logger.debug('Fetched collections', { sectionId, count: collections.length });
      return collections.map((c: Record<string, unknown>) => ({
        ratingKey: c.ratingKey as string,
        title: c.title as string,
        thumb: c.thumb ? `${this.serverUrl}${c.thumb}?X-Plex-Token=${this.token}` : undefined,
        childCount: (c.childCount as number) || 0,
        addedAt: c.addedAt ? new Date((c.addedAt as number) * 1000) : undefined,
      }));
    } catch (err) {
      logger.error('Error fetching collections', { sectionId, error: (err as Error).message });
      return [];
    }
  }

  async getCollectionItems(collectionRatingKey: string): Promise<PlexItem[]> {
    if (!this.serverUrl) throw new Error('Server URL not set');

    try {
      const url = `${this.serverUrl}/library/collections/${collectionRatingKey}/children?X-Plex-Token=${this.token}`;
      const response = await this.fetchWithTimeout(url, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        logger.warn('Failed to get collection items', { collectionRatingKey, status: response.status });
        return [];
      }

      const data = await response.json();
      const items = data.MediaContainer?.Metadata || [];

      logger.debug('Fetched collection items', { collectionRatingKey, count: items.length });
      return items.map((item: Record<string, unknown>) => this.mapPlexItem(item));
    } catch (err) {
      logger.error('Error fetching collection items', { collectionRatingKey, error: (err as Error).message });
      return [];
    }
  }

  buildDeepLink(ratingKey: string, type: 'app' | 'web' = 'app'): string {
    if (type === 'app') {
      return `plex://play/?metadataKey=%2Flibrary%2Fmetadata%2F${ratingKey}&metadataType=1`;
    }

    if (this.machineId && this.serverUrl) {
      return `https://app.plex.tv/desktop#!/server/${this.machineId}/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`;
    }

    return `https://app.plex.tv/desktop#!/provider/tv.plex.provider.discover/details?key=%2Flibrary%2Fmetadata%2F${ratingKey}`;
  }

  buildPlayLinks(ratingKey: string): { app: string; web: string } {
    return {
      app: this.buildDeepLink(ratingKey, 'app'),
      web: this.buildDeepLink(ratingKey, 'web'),
    };
  }
}
