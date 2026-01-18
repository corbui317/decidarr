const PLEX_TV_BASE = 'https://plex.tv';

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
  private headers: Record<string, string>;

  constructor(token: string, serverUrl: string | null = null) {
    this.token = token;
    this.serverUrl = serverUrl;
    this.headers = {
      'X-Plex-Token': token,
      Accept: 'application/json',
    };
  }

  async validateToken(): Promise<{ valid: boolean; user?: PlexUser; error?: string }> {
    try {
      const response = await fetch(`${PLEX_TV_BASE}/api/v2/user`, {
        headers: {
          ...this.headers,
          'X-Plex-Client-Identifier': 'decidarr',
        },
      });

      if (!response.ok) {
        return { valid: false, error: 'Invalid token' };
      }

      const data = await response.json();
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
      return { valid: false, error: (error as Error).message };
    }
  }

  async getServers(): Promise<PlexServer[]> {
    const response = await fetch(`${PLEX_TV_BASE}/api/v2/resources?includeHttps=1&includeRelay=1`, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error('Failed to get servers');
    }

    const data = await response.json();
    const servers = data.filter((r: any) => r.provides === 'server');

    return servers.map((server: any) => ({
      name: server.name,
      clientIdentifier: server.clientIdentifier,
      connections: server.connections.map((c: any) => ({
        uri: c.uri,
        local: c.local,
        relay: c.relay,
      })),
    }));
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

  private mapPlexItem(item: any, detailed = false): PlexItem {
    const base: PlexItem = {
      plexId: item.ratingKey,
      title: item.title,
      year: item.year,
      posterUrl: item.thumb ? `${this.serverUrl}${item.thumb}?X-Plex-Token=${this.token}` : undefined,
      genres: item.Genre ? item.Genre.map((g: any) => g.tag) : [],
      summary: item.summary,
      rating: item.rating,
      duration: item.duration,
      contentRating: item.contentRating,
      studio: item.studio,
      addedAt: item.addedAt ? new Date(item.addedAt * 1000) : undefined,
      type: item.type,
    };

    if (item.type === 'show') {
      base.seasonCount = item.childCount;
      base.episodeCount = item.leafCount;
    }

    if (detailed) {
      base.art = item.art ? `${this.serverUrl}${item.art}?X-Plex-Token=${this.token}` : undefined;
      base.tagline = item.tagline;
      base.directors = item.Director ? item.Director.map((d: any) => d.tag) : [];
      base.actors = item.Role ? item.Role.slice(0, 10).map((r: any) => r.tag) : [];
      base.writers = item.Writer ? item.Writer.map((w: any) => w.tag) : [];
    }

    return base;
  }
}
