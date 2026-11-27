import { createLogger } from '../logger';
import { createIntegrationClient, IntegrationError, type IntegrationClient } from '../integrations/client';
import { getPlexClientHeaders } from './plex-oauth';

const logger = createLogger('PlexService');
const PLEX_SERVER_TIMEOUT_MS = 15_000;

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
  thumbPath?: string;
  childCount: number;
  addedAt?: Date;
}

function extractTmdbIdFromGuidString(guid: string): string | undefined {
  const pathMatch = guid.match(/(?:themoviedb|tmdb):\/\/(?:movie|show|tv)\/(\d+)/i);
  if (pathMatch) return pathMatch[1];

  const queryMatch = guid.match(/(?:themoviedb|tmdb):\/\/(?:movie|show|tv)\?[^#]*\bid=(\d+)/i);
  if (queryMatch) return queryMatch[1];

  return undefined;
}

export function parseTmdbIdFromPlexGuid(guid: unknown): string | undefined {
  if (typeof guid === 'string') {
    return extractTmdbIdFromGuidString(guid);
  }

  if (Array.isArray(guid)) {
    for (const entry of guid) {
      if (typeof entry === 'string') {
        const id = extractTmdbIdFromGuidString(entry);
        if (id) return id;
      } else if (entry && typeof entry === 'object') {
        const idField = (entry as { id?: unknown }).id;
        if (typeof idField === 'string') {
          const id = extractTmdbIdFromGuidString(idField);
          if (id) return id;
        }
      }
    }
  }

  return undefined;
}

export interface PlexItem {
  plexId: string;
  title: string;
  tmdbId?: string;
  year?: number;
  /** @deprecated Use thumbPath with /api/plex/image proxy */
  posterUrl?: string;
  /** Plex-relative thumb path, e.g. /library/metadata/123/thumb/abc */
  thumbPath?: string;
  /** @deprecated Use artPath with /api/plex/image proxy */
  art?: string;
  artPath?: string;
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

/** The Plex server refused the user's access token: only a new sign-in fixes it, so callers must not swallow it. */
export function isPlexSignInRequired(err: unknown): boolean {
  return err instanceof IntegrationError && err.integration === 'Plex' && err.status === 401;
}

/**
 * The configured Plex server, reached with one user's access token for that server
 * (never a plex.tv account token). A 401 from the server means that token stopped
 * working, and surfaces as an IntegrationError with status 401 that callers map to
 * "sign in again".
 */
/**
 * The machine id of the Plex server at `serverUrl`, from /identity, which Plex answers without a
 * token, so no user's token is sent to a server before it is known to be this install's. Null when
 * nothing there answers as a Plex server.
 */
export function readPlexServerIdentity(serverUrl: string): Promise<string | null> {
  return new PlexService(null, serverUrl).fetchMachineIdFromServer().catch(() => null);
}

export class PlexService {
  private serverUrl: string;
  private machineId: string | null;
  private serverToken: string | null;
  private server: Promise<IntegrationClient> | null = null;

  /** A null token reaches only what Plex answers without one, such as /identity. */
  constructor(serverToken: string | null, serverUrl: string, machineId: string | null = null) {
    this.serverToken = serverToken;
    this.serverUrl = serverUrl;
    this.machineId = machineId;
  }

  private client(): Promise<IntegrationClient> {
    this.server ??= getPlexClientHeaders().then((headers) => {
      const client = createIntegrationClient({
        integration: 'Plex',
        baseUrl: this.serverUrl,
        auth: this.serverToken ? { header: 'X-Plex-Token', value: this.serverToken } : undefined,
        headers,
        timeoutMs: PLEX_SERVER_TIMEOUT_MS,
      });
      return {
        async request(path, options) {
          const response = await client.request(path, options);
          if (response.status === 401) {
            await response.body?.cancel();
            throw new IntegrationError('Plex', 'http_status', 'HTTP 401', 401);
          }
          return response;
        },
        json: client.json,
      };
    });
    return this.server;
  }

  // Fetch machineId directly from the Plex server's identity endpoint
  // This is more reliable than server discovery when the URL is manually entered
  async fetchMachineIdFromServer(): Promise<string | null> {
    try {
      logger.debug('Fetching machineId from server identity', { serverUrl: this.serverUrl });
      const response = await (await this.client()).request('/identity');

      if (!response.ok) {
        logger.warn('Failed to fetch server identity', { status: response.status });
        return null;
      }

      const data = await response.json();
      const machineId = data.MediaContainer?.machineIdentifier;
      
      if (machineId) {
        logger.info('Fetched machineId from server', { machineId });
        this.machineId = machineId;
        return machineId;
      }

      logger.warn('Server identity response missing machineIdentifier');
      return null;
    } catch (err) {
      if (isPlexSignInRequired(err)) throw err;
      logger.error('Error fetching server identity', { error: (err as Error).message });
      return null;
    }
  }

  async getLibrarySections(): Promise<PlexLibrary[]> {
    const server = await this.client();

    logger.debug('Fetching library sections', { serverUrl: this.serverUrl });
    const response = await server.request('/library/sections');

    if (!response.ok) {
      logger.warn('Failed to get library sections', { status: response.status });
      throw new Error(`Failed to get library sections (HTTP ${response.status})`);
    }

    const data = await response.json();
    const sections = data.MediaContainer?.Directory || [];
    logger.debug('Got library sections', { count: sections.length });

    return sections.map((section: Record<string, unknown>) => ({
      id: section.key as string,
      title: section.title as string,
      type: section.type as string,
      agent: section.agent as string,
      scanner: section.scanner as string,
      language: section.language as string,
      uuid: section.uuid as string,
    }));
  }

  async getLibraryItems(sectionId: string): Promise<PlexItem[]> {
    const server = await this.client();

    logger.debug('Fetching library items', { sectionId });
    const response = await server.request(`/library/sections/${sectionId}/all`);

    if (!response.ok) {
      logger.warn('Failed to get library items', { sectionId, status: response.status });
      throw new Error(`Failed to get library items (HTTP ${response.status})`);
    }

    const data = await response.json();
    const items = data.MediaContainer?.Metadata || [];
    logger.debug('Got library items', { sectionId, count: items.length });

    return items.map((item: Record<string, unknown>) => this.mapPlexItem(item));
  }

  async getItemMetadata(ratingKey: string): Promise<PlexItem> {
    const server = await this.client();

    logger.debug('Fetching item metadata', { ratingKey });
    const response = await server.request(`/library/metadata/${ratingKey}`);

    if (!response.ok) {
      logger.warn('Failed to get item metadata', { ratingKey, status: response.status });
      throw new Error(`Failed to get item metadata (HTTP ${response.status})`);
    }

    const data = await response.json();
    const item = data.MediaContainer?.Metadata?.[0];
    return this.mapPlexItem(item, true);
  }

  async getShowEpisodes(showRatingKey: string): Promise<Record<string, unknown>[]> {
    const server = await this.client();

    logger.debug('Fetching show episodes', { showRatingKey });
    const response = await server.request(`/library/metadata/${showRatingKey}/allLeaves`);

    if (!response.ok) {
      logger.warn('Failed to get show episodes', { showRatingKey, status: response.status });
      throw new Error(`Failed to get show episodes (HTTP ${response.status})`);
    }

    const data = await response.json();
    const episodes = data.MediaContainer?.Metadata || [];

    return episodes.map((ep: Record<string, unknown>) => ({
      plexId: ep.ratingKey as string,
      title: ep.title as string,
      seasonNumber: ep.parentIndex as number,
      episodeNumber: ep.index as number,
      summary: ep.summary as string,
      duration: ep.duration as number,
      rating: ep.rating as number,
      thumb: ep.thumb ? `${ep.thumb}` : null,
      thumbPath: ep.thumb ? String(ep.thumb) : null,
    }));
  }

  private mapPlexItem(item: Record<string, unknown>, detailed = false): PlexItem {
    const guid = item.guid as string | undefined;
    const guidArray = item.Guid as { id?: string }[] | undefined;
    const tmdbId =
      parseTmdbIdFromPlexGuid(guid) ??
      parseTmdbIdFromPlexGuid(guidArray);

    const thumb = item.thumb as string | undefined;
    const art = item.art as string | undefined;

    const base: PlexItem = {
      plexId: item.ratingKey as string,
      title: item.title as string,
      tmdbId,
      year: item.year as number | undefined,
      thumbPath: thumb || undefined,
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
      base.artPath = art || undefined;
      base.tagline = item.tagline as string | undefined;
      base.directors = item.Director ? (item.Director as { tag: string }[]).map((d) => d.tag) : [];
      base.actors = item.Role ? (item.Role as { tag: string }[]).slice(0, 10).map((r) => r.tag) : [];
      base.writers = item.Writer ? (item.Writer as { tag: string }[]).map((w) => w.tag) : [];
    }

    return base;
  }

  async getCollections(sectionId: string): Promise<PlexCollection[]> {
    const server = await this.client();

    try {
      const response = await server.request(`/library/sections/${sectionId}/collections`);

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
        thumbPath: c.thumb ? String(c.thumb) : undefined,
        childCount: (c.childCount as number) || 0,
        addedAt: c.addedAt ? new Date((c.addedAt as number) * 1000) : undefined,
      }));
    } catch (err) {
      if (isPlexSignInRequired(err)) throw err;
      logger.error('Error fetching collections', { sectionId, error: (err as Error).message });
      return [];
    }
  }

  async getCollectionItems(collectionRatingKey: string): Promise<PlexItem[]> {
    const server = await this.client();

    try {
      const response = await server.request(`/library/collections/${collectionRatingKey}/children`);

      if (!response.ok) {
        logger.warn('Failed to get collection items', { collectionRatingKey, status: response.status });
        return [];
      }

      const data = await response.json();
      const items = data.MediaContainer?.Metadata || [];

      logger.debug('Fetched collection items', { collectionRatingKey, count: items.length });
      return items.map((item: Record<string, unknown>) => this.mapPlexItem(item));
    } catch (err) {
      if (isPlexSignInRequired(err)) throw err;
      logger.error('Error fetching collection items', { collectionRatingKey, error: (err as Error).message });
      return [];
    }
  }

  /** A library image, as the Plex server returns it; `path` is an already validated /library/ path. */
  async getImage(path: string, width?: number): Promise<Response> {
    return (await this.client()).request(path, {
      headers: { Accept: 'image/*,*/*' },
      query: width === undefined ? undefined : { width },
    });
  }

  // Build a deep link to view/play content in Plex
  // Supports multiple targets: web, desktop app, iOS/tvOS, Android
  buildDeepLink(
    ratingKey: string,
    target: 'web' | 'app' | 'ios' | 'android' = 'web'
  ): string {
    const metadataKey = `/library/metadata/${ratingKey}`;
    const encodedKey = encodeURIComponent(metadataKey);

    switch (target) {
      case 'web':
        // Plex Web - requires machineId to link to the correct server
        if (this.machineId) {
          return `https://app.plex.tv/desktop#!/server/${this.machineId}/details?key=${encodedKey}`;
        }
        // Fallback without machineId (won't work well)
        logger.warn('Building web link without machineId - may not work correctly');
        return `https://app.plex.tv/desktop#!/server/*/details?key=${encodedKey}`;

      case 'app':
        // Desktop app (macOS/Windows) via plex:// protocol
        if (this.machineId) {
          return `plex://server/${this.machineId}/details?key=${encodedKey}`;
        }
        return `plex://play?metadataKey=${encodedKey}`;

      case 'ios':
        // iOS/tvOS app via plex:// - same format works for Apple TV
        if (this.machineId) {
          return `plex://server/${this.machineId}/playMedia?key=${encodedKey}`;
        }
        return `plex://playMedia?key=${encodedKey}`;

      case 'android':
        // Android/Android TV (Shield) via plex:// protocol
        if (this.machineId) {
          return `plex://server/${this.machineId}/playMedia?key=${encodedKey}`;
        }
        return `plex://playMedia?key=${encodedKey}`;

      default:
        return this.buildDeepLink(ratingKey, 'web');
    }
  }

  // Build all play links for different platforms
  buildPlayLinks(ratingKey: string): {
    web: string;
    app: string;
    ios: string;
    android: string;
    machineId: string | null;
  } {
    return {
      web: this.buildDeepLink(ratingKey, 'web'),
      app: this.buildDeepLink(ratingKey, 'app'),
      ios: this.buildDeepLink(ratingKey, 'ios'),
      android: this.buildDeepLink(ratingKey, 'android'),
      machineId: this.machineId,
    };
  }
}
