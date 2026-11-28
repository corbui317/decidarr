/**
 * The library item store: the one place that reads and writes cached library items.
 *
 * Item metadata and enrichment are shared per server and library, so enrichment work is not
 * repeated. Visibility is per user: each user's visible item keys are fetched with that user's
 * own Plex server token and stored separately, and every read intersects the two, so a Friend
 * with Plex label or content-rating restrictions never receives a title Plex hides from them,
 * and one user's sync never changes another user's pool.
 */
import type { MediaType } from '@decidarr/api-contracts';
import type { LibraryAccess } from '@/lib/auth';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { getOrCreateSettings, type ISettings } from '@/lib/models/Settings';
import { DomainError } from '@/lib/request/errors';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { enrichWithOverseerr } from '@/lib/services/overseerr-sync';
import { createLogger } from '@/lib/logger';
import { embeddedStorage } from './embedded-storage';
import type { LibraryStorage, StoredLibrary, VisibleSet } from './storage';

const logger = createLogger('LibraryStore');

const storage: LibraryStorage = embeddedStorage;

/** The storage key for the configured Plex server. */
function serverOf(access: LibraryAccess): string {
  return access.plexMachineId || 'unknown';
}

export interface LibraryView {
  /** The requested libraries' items this user may see. */
  items: ILibraryItem[];
  /** When this user's view of the requested libraries was last synced from Plex; null when none was. */
  lastSyncedAt: Date | null;
  /** False when this call had to sync any of the libraries from Plex first. */
  fromCache: boolean;
}

const isExpired = (record: { expiresAt: Date }) => record.expiresAt.getTime() <= Date.now();

/**
 * Whether this user's view of a library must be fetched before it can be read: never synced,
 * expired, or naming items the shared metadata no longer holds (it was rebuilt or lost).
 */
function needsSync(library: StoredLibrary | undefined, visible: VisibleSet | undefined): boolean {
  if (!library || !visible || isExpired(library) || isExpired(visible)) return true;
  const shared = new Set(library.items.map((item) => item.plexId));
  return visible.plexIds.some((plexId) => !shared.has(plexId));
}

async function read(access: LibraryAccess, libraryIds: string[]) {
  const server = serverOf(access);
  const [libraries, visible] = await Promise.all([
    storage.readLibraries(server, libraryIds),
    storage.readVisibility(server, access.userId, libraryIds),
  ]);
  return {
    libraries: new Map(libraries.map((library) => [library.libraryId, library])),
    visible: new Map(visible.map((set) => [set.libraryId, set])),
  };
}

/**
 * The items of `libraryIds` that this user may see, optionally only those of one media type.
 * A library this user has no current view of is first synced with their own server token.
 * Callers pass only library ids the user can access (see getAccessibleLibraryIds).
 */
export async function itemsFor(
  access: LibraryAccess,
  { libraryIds, mediaType }: { libraryIds: string[]; mediaType?: MediaType }
): Promise<LibraryView> {
  let { libraries, visible } = await read(access, libraryIds);
  const wanted = libraryIds.filter((id) => !mediaType || (libraries.get(id)?.mediaType ?? mediaType) === mediaType);

  const stale = wanted.filter((id) => needsSync(libraries.get(id), visible.get(id)));
  if (stale.length > 0) {
    await Promise.all(stale.map((id) => syncLibrary(access, id)));
    ({ libraries, visible } = await read(access, libraryIds));
  }

  const items: ILibraryItem[] = [];
  let lastSyncedAt: Date | null = null;
  for (const id of wanted) {
    const library = libraries.get(id);
    const set = visible.get(id);
    if (!library || !set || (mediaType && library.mediaType !== mediaType)) continue;
    const keys = new Set(set.plexIds);
    items.push(...library.items.filter((item) => keys.has(item.plexId)));
    if (!lastSyncedAt || set.lastSyncedAt < lastSyncedAt) lastSyncedAt = set.lastSyncedAt;
  }

  return { items, lastSyncedAt, fromCache: stale.length === 0 };
}

export interface LibraryFacets {
  genres: string[];
  /** Null when no visible item has a year. */
  years: { min: number; max: number } | null;
  contentRatings: string[];
  studios: string[];
  /** Null when no visible item has a rating. */
  ratingRange: { min: number; max: number } | null;
}

const RATING_ORDER = [
  'G', 'TV-G', 'TV-Y', 'TV-Y7',
  'PG', 'TV-PG',
  'PG-13', 'TV-14',
  'R', 'TV-MA', 'NC-17',
  'NR', 'Not Rated', 'Unrated',
];

/** A rating's place in RATING_ORDER: its exact entry, else the first entry it contains (e.g. "gb/PG"). */
function ratingRank(rating: string): number {
  const upper = rating.toUpperCase();
  const exact = RATING_ORDER.findIndex((r) => r.toUpperCase() === upper);
  return exact !== -1 ? exact : RATING_ORDER.findIndex((r) => upper.includes(r.toUpperCase()));
}

function compareContentRatings(a: string, b: string): number {
  const aIndex = ratingRank(a);
  const bIndex = ratingRank(b);
  if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

/** The filter values present among the items of `libraryIds` this user may see. */
export async function facets(access: LibraryAccess, libraryIds: string[]): Promise<LibraryFacets> {
  const { items } = await itemsFor(access, { libraryIds });

  const genres = new Set<string>();
  const contentRatings = new Set<string>();
  const studios = new Set<string>();
  const years: number[] = [];
  const ratings: number[] = [];
  for (const item of items) {
    item.genres?.forEach((genre) => genres.add(genre));
    if (item.contentRating) contentRatings.add(item.contentRating);
    if (item.studio) studios.add(item.studio);
    if (item.year) years.push(item.year);
    if (item.rating !== undefined && item.rating !== null) ratings.push(item.rating);
  }

  return {
    genres: Array.from(genres).sort(),
    years: years.length ? { min: Math.min(...years), max: Math.max(...years) } : null,
    contentRatings: Array.from(contentRatings).sort(compareContentRatings),
    studios: Array.from(studios).sort(),
    ratingRange: ratings.length
      ? { min: Math.floor(Math.min(...ratings)), max: Math.ceil(Math.max(...ratings)) }
      : null,
  };
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Fetches this user's view of a library with their own server token, stores it as their
 * visible set, and merges its items into the shared metadata. It never changes another
 * user's visible set, and keeps every shared item another user can still see. Concurrent
 * syncs of the same user's library share one fetch.
 */
export function syncLibrary(access: LibraryAccess, libraryId: string): Promise<void> {
  const key = `${access.userId}:${serverOf(access)}:${libraryId}`;
  let running = inFlight.get(key);
  if (!running) {
    running = fetchAndStore(access, libraryId).finally(() => inFlight.delete(key));
    inFlight.set(key, running);
  }
  return running;
}

async function fetchAndStore(access: LibraryAccess, libraryId: string): Promise<void> {
  const settings = await getOrCreateSettings();
  const server = serverOf(access);
  const plex = new PlexService(access.plexToken, access.plexServerUrl, access.plexMachineId);

  const section = (await plex.getLibrarySections()).find((s) => s.id === libraryId);
  if (!section) {
    throw new DomainError('NOT_FOUND', 'Library not found');
  }

  const fresh = (await plex.getLibraryItems(libraryId)) as ILibraryItem[];
  const [existing] = await storage.readLibraries(server, [libraryId]);

  mergeExistingEnrichment(fresh, existing?.items);
  await enrichWithTmdb(fresh, section.type, settings);
  await enrichWithOverseerr(fresh, section.type, settings, existing?.items);

  const freshKeys = new Set(fresh.map((item) => item.plexId));
  const othersKeys = await storage.keysVisibleToOthers(server, libraryId, access.userId);
  const keptForOthers = (existing?.items ?? []).filter(
    (item) => !freshKeys.has(item.plexId) && othersKeys.has(item.plexId)
  );

  const lastSyncedAt = new Date();
  const expiresAt = new Date(lastSyncedAt.getTime() + settings.syncFrequencyHours * 60 * 60 * 1000);

  // Shared metadata first: until the visible set is written, reads intersect the old set with a superset.
  await storage.writeLibrary(server, {
    libraryId,
    libraryName: section.title,
    mediaType: section.type,
    items: [...fresh, ...keptForOthers],
    lastSyncedAt,
    expiresAt,
  });
  await storage.writeVisibility(server, access.userId, {
    libraryId,
    plexIds: Array.from(freshKeys),
    lastSyncedAt,
    expiresAt,
  });
}

const ENRICHMENT_FIELDS = [
  'tmdbId',
  'contentRating',
  'rating',
  'tmdbRating',
  'studio',
  'networks',
  'studios',
  'enrichedAt',
  'attemptedEnrichmentAt',
  'overseerrStatus',
  'overseerrSyncedAt',
] as const;

function copyField<K extends keyof ILibraryItem>(target: ILibraryItem, source: ILibraryItem, field: K): void {
  target[field] = source[field];
}

/** Keeps enrichment the shared metadata already has for items Plex returned without it. */
function mergeExistingEnrichment(items: ILibraryItem[], existingItems?: ILibraryItem[]): void {
  if (!existingItems?.length) return;

  const byPlexId = new Map(existingItems.map((item) => [item.plexId, item]));
  for (const item of items) {
    const existing = byPlexId.get(item.plexId);
    if (!existing) continue;

    for (const field of ENRICHMENT_FIELDS) {
      const freshValue = item[field];
      const freshMissing =
        freshValue == null || freshValue === '' || (Array.isArray(freshValue) && freshValue.length === 0);
      if (freshMissing && existing[field] != null) {
        copyField(item, existing, field);
      }
    }
  }
}

const ENRICHMENT_RETRY_HOURS = 24;
const ENRICHMENT_BATCH_SIZE = 50;

function isItemUnenriched(item: ILibraryItem): boolean {
  if (item.enrichedAt && item.tmdbId) return false;
  if (item.attemptedEnrichmentAt) {
    const hoursSinceAttempt = (Date.now() - item.attemptedEnrichmentAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceAttempt < ENRICHMENT_RETRY_HOURS) return false;
  }
  return true;
}

/** Fills TMDb ids, ratings, certifications and studios into up to one batch of unenriched items, in place. */
async function enrichWithTmdb(items: ILibraryItem[], mediaType: MediaType, settings: ISettings): Promise<void> {
  const tmdbApiKey = settings.getDecryptedTmdbKey();
  if (!tmdbApiKey) return;

  const itemsToEnrich = items.filter(isItemUnenriched).slice(0, ENRICHMENT_BATCH_SIZE);
  if (itemsToEnrich.length === 0) return;

  try {
    const enrichments = await new TMDbService(tmdbApiKey).enrichBatch(
      itemsToEnrich.map((item) => ({
        title: item.title,
        year: item.year,
        contentRating: item.contentRating,
        rating: item.rating,
        studio: item.studio,
      })),
      mediaType
    );

    enrichments.forEach((enrichment, i) => {
      const item = itemsToEnrich[i];
      let enriched = false;

      if (enrichment.tmdbId && !item.tmdbId) {
        item.tmdbId = String(enrichment.tmdbId);
        enriched = true;
      }
      if (enrichment.certification && !item.contentRating) {
        item.contentRating = enrichment.certification;
      }
      if (enrichment.rating && !item.rating) {
        item.rating = enrichment.rating;
        item.tmdbRating = enrichment.rating;
      }
      if (!item.studio) {
        if (mediaType === 'show' && enrichment.networks?.length) {
          item.studio = enrichment.networks[0];
          item.networks = enrichment.networks;
        } else if (enrichment.studios?.length) {
          item.studio = enrichment.studios[0];
          item.studios = enrichment.studios;
        }
      }

      if (enriched) {
        item.enrichedAt = new Date();
      } else {
        item.attemptedEnrichmentAt = new Date();
      }
    });
  } catch (err) {
    // Only TMDb is called here; a Plex sign-in failure cannot surface from this block.
    logger.error('Batch enrichment error', { error: (err as Error).message });
  }
}
