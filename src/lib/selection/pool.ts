/**
 * The selection pool: the items a Session may spin from for one set of parameters.
 *
 * Spin and pool count both load the pool, and `pick` and `breakdown` read the same predicate
 * list, so the count shown is always the number of items Spin can pick. Items come only from
 * the library item store, which already limits them to what this user's own Plex view shows.
 */
import type { DataStats, FilterBreakdown, Filters, MediaType } from '@decidarr/api-contracts';
import { EMPTY_DATA_STATS } from '@decidarr/api-contracts';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { itemsFor } from '@/lib/library/store';
import { createLogger } from '@/lib/logger';
import type { ILibraryItem } from '@/lib/models/LibraryCache';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { WatchedItem } from '@/lib/models/WatchedItem';
import type { Session } from '@/lib/request/session';
import { PlexService, isPlexSignInRequired } from '@/lib/services/plex';

const logger = createLogger('Selection:Pool');

export interface PoolParams {
  libraryIds: string[];
  mediaType: MediaType;
  filters: Filters;
}

/** Why a pool is empty before any filter applies. */
export type PoolProblem = 'NO_LIBRARIES' | 'NO_ACCESSIBLE_LIBRARIES' | 'MACHINE_ID_MISSING' | 'NO_ITEMS_IN_LIBRARIES';

/** How Spin (an error response) and pool count (an empty reason) report each problem. */
export const POOL_PROBLEMS: Record<
  PoolProblem,
  { status: number; error: string; suggestion?: string; emptyReason: string }
> = {
  NO_LIBRARIES: { status: 400, error: 'At least one library must be selected', emptyReason: 'No libraries selected' },
  NO_ACCESSIBLE_LIBRARIES: {
    status: 403,
    error: 'No accessible libraries selected',
    emptyReason: 'No items found in selected libraries. Try syncing your libraries first.',
  },
  MACHINE_ID_MISSING: {
    status: 400,
    error: 'Plex machine ID not configured',
    emptyReason: 'Plex machine ID not configured',
  },
  NO_ITEMS_IN_LIBRARIES: {
    status: 404,
    error: 'No items found in selected libraries',
    suggestion: 'Try syncing your libraries first',
    emptyReason: 'No items found in selected libraries. Try syncing your libraries first.',
  },
};

export interface Pool {
  /** Why there is nothing to pick from before any filter applies; null when the libraries hold items. */
  problem: PoolProblem | null;
  /** The accessible libraries the pool was drawn from, each once. */
  libraryIds: string[];
  /** The items this user may see in those libraries, before any filter. */
  totalItems: number;
  dataStats: DataStats;
  /** The items that pass every active filter: exactly what `pick` chooses from. */
  count: number;
  /** A random item from the pool; null when it is empty. */
  pick(): ILibraryItem | null;
  /** What each active filter removed, in order, and why the pool is empty when one emptied it. */
  breakdown(): { breakdown: FilterBreakdown[]; emptyReason: string | null };
}

interface Predicate {
  name: string;
  label: string;
  active: boolean;
  keep(item: ILibraryItem): boolean;
  emptyReason(): string;
}

interface PredicateInput {
  filters: Filters;
  watchedIds: Set<string>;
  /** Null when no collection is selected. */
  collectionItemIds: Set<string> | null;
  overseerrFilterEnabled: boolean;
  dataStats: DataStats;
}

const RATING_PRESETS: Record<string, { name: string; keep: (rating: number) => boolean }> = {
  critically_acclaimed: { name: 'Highly Rated (7.5+)', keep: (rating) => rating >= 7.5 },
  hidden_gems: { name: 'Hidden Gems (6.5-8.0)', keep: (rating) => rating >= 6.5 && rating <= 8.0 },
  top_rated: { name: 'Top Rated (8.0+)', keep: (rating) => rating >= 8.0 },
};

const SYNC_HINT = 'Try syncing your library to fetch this data from TMDb.';
const NO_RATINGS =
  'Score Rating filter active, but no items in your library have ratings. Try syncing your library to fetch ratings from TMDb.';

/** The one predicate list behind both the pool and its breakdown, in breakdown order. */
function predicates({ filters, watchedIds, collectionItemIds, overseerrFilterEnabled, dataStats }: PredicateInput): Predicate[] {
  const { genres, yearRange, contentRatings, studios, ratingRange, ratingFilter } = filters;
  const preset = ratingFilter ? RATING_PRESETS[ratingFilter] : undefined;
  const minRating = ratingRange?.min;
  const maxRating = ratingRange?.max;

  return [
    {
      name: 'collections',
      label: 'Collections',
      active: collectionItemIds !== null,
      keep: (item) => !!collectionItemIds?.has(item.plexId),
      emptyReason: () => 'No items found in the selected collections',
    },
    {
      name: 'genres',
      label: 'Genres',
      active: !!genres?.length,
      keep: (item) => !!item.genres?.some((genre) => genres!.includes(genre)),
      emptyReason: () => `No items have the selected genres: ${genres!.join(', ')}`,
    },
    {
      name: 'yearRange',
      label: 'Year Range',
      active: !!(yearRange?.start || yearRange?.end),
      keep: (item) =>
        (!yearRange?.start || (!!item.year && item.year >= yearRange.start)) &&
        (!yearRange?.end || (!!item.year && item.year <= yearRange.end)),
      emptyReason: () => `No items found in year range ${yearRange?.start || '...'} - ${yearRange?.end || '...'}`,
    },
    {
      name: 'contentRatings',
      label: 'Age Rating',
      active: !!contentRatings?.length,
      keep: (item) => !!item.contentRating && contentRatings!.includes(item.contentRating),
      emptyReason: () =>
        dataStats.itemsWithContentRating === 0
          ? `Age Rating filter active, but no items in your library have age ratings. ${SYNC_HINT}`
          : `No items have the selected age ratings: ${contentRatings!.join(', ')}`,
    },
    {
      name: 'studios',
      label: 'Studios/Networks',
      active: !!studios?.length,
      keep: (item) => {
        const studio = item.studio?.toLowerCase();
        return !!studio && studios!.some((wanted) => studio.includes(wanted.toLowerCase()));
      },
      emptyReason: () =>
        dataStats.itemsWithStudio === 0
          ? `Studios filter active, but no items in your library have studio/network info. ${SYNC_HINT}`
          : `No items found from selected studios/networks: ${studios!.join(', ')}`,
    },
    {
      name: 'ratingRange',
      label: 'Score Rating (Custom)',
      active: minRating != null || maxRating != null,
      keep: (item) =>
        (minRating == null || (!!item.rating && item.rating >= minRating)) &&
        (maxRating == null || (!!item.rating && item.rating <= maxRating)),
      emptyReason: () =>
        dataStats.itemsWithRating === 0
          ? NO_RATINGS
          : `No items match score rating ${minRating || 0} - ${maxRating || 10}`,
    },
    {
      name: 'ratingFilter',
      label: 'Score Rating (Preset)',
      active: !!ratingFilter,
      // An unknown preset filters nothing.
      keep: (item) => !preset || (!!item.rating && preset.keep(item.rating)),
      emptyReason: () =>
        dataStats.itemsWithRating === 0 ? NO_RATINGS : `No items match "${preset?.name || ratingFilter}"`,
    },
    {
      name: 'unwatchedOnly',
      label: 'Unwatched Only',
      active: !!filters.unwatchedOnly,
      keep: (item) => !watchedIds.has(item.plexId),
      emptyReason: () => 'All matching items have been marked as watched',
    },
    {
      name: 'overseerrAvailable',
      label: 'Overseerr (exclude available)',
      active: overseerrFilterEnabled,
      keep: (item) => item.overseerrStatus !== 'available',
      emptyReason: () =>
        'All matching items are fully available in Overseerr. Disable the Overseerr filter or sync your library.',
    },
  ];
}

function computeDataStats(items: ILibraryItem[]): DataStats {
  return {
    itemsWithRating: items.filter((i) => i.rating != null).length,
    itemsWithContentRating: items.filter((i) => i.contentRating).length,
    itemsWithStudio: items.filter((i) => i.studio).length,
    itemsWithYear: items.filter((i) => i.year != null).length,
    itemsWithGenres: items.filter((i) => i.genres && i.genres.length > 0).length,
  };
}

/** The plex ids in the selected collections; a collection Plex fails to list adds none. */
async function collectionItemIdsFor(collectionKeys: string[], plex: PlexService): Promise<Set<string>> {
  const ids = new Set<string>();
  await Promise.all(
    collectionKeys.map(async (collectionKey) => {
      try {
        for (const item of await plex.getCollectionItems(collectionKey)) ids.add(item.plexId);
      } catch (err) {
        if (isPlexSignInRequired(err)) throw err;
        logger.warn('Failed to fetch collection items', { collectionKey, error: (err as Error).message });
      }
    })
  );
  return ids;
}

async function watchedIdsFor(session: Session): Promise<Set<string>> {
  const watched = await WatchedItem.find({ userId: session.userId }).select('plexId').lean();
  return new Set(watched.map((w) => w.plexId));
}

function emptyPool(problem: PoolProblem, libraryIds: string[] = []): Pool {
  return {
    problem,
    libraryIds,
    totalItems: 0,
    dataStats: EMPTY_DATA_STATS,
    count: 0,
    pick: () => null,
    breakdown: () => ({ breakdown: [], emptyReason: POOL_PROBLEMS[problem].emptyReason }),
  };
}

/** Loads the pool this Session may spin from for these parameters. */
export async function loadPool(session: Session, { libraryIds, mediaType, filters }: PoolParams): Promise<Pool> {
  // Checked first: getAccessibleLibraryIds reads "no ids" as "every library".
  if (libraryIds.length === 0) return emptyPool('NO_LIBRARIES');

  const settings = await getOrCreateSettings();
  const access = {
    userId: session.userId.toString(),
    plexToken: session.plex.token,
    plexServerUrl: session.plex.serverUrl,
    plexMachineId: settings.plexMachineId || null,
  };
  // Each library once: a library selected twice would count its items twice.
  const allowed = [...new Set(await getAccessibleLibraryIds(access, libraryIds))];
  if (allowed.length === 0) return emptyPool('NO_ACCESSIBLE_LIBRARIES');
  if (!settings.plexMachineId) return emptyPool('MACHINE_ID_MISSING', allowed);

  const { items } = await itemsFor(access, { libraryIds: allowed, mediaType });
  if (items.length === 0) return emptyPool('NO_ITEMS_IN_LIBRARIES', allowed);

  const [watchedIds, collectionItemIds] = await Promise.all([
    filters.unwatchedOnly ? watchedIdsFor(session) : new Set<string>(),
    filters.collections?.length
      ? collectionItemIdsFor(
          filters.collections,
          new PlexService(session.plex.token, session.plex.serverUrl, settings.plexMachineId)
        )
      : null,
  ]);

  const dataStats = computeDataStats(items);
  const active = predicates({
    filters,
    watchedIds,
    collectionItemIds,
    overseerrFilterEnabled: !!settings.overseerrFilterEnabled,
    dataStats,
  }).filter((predicate) => predicate.active);
  const matching = items.filter((item) => active.every((predicate) => predicate.keep(item)));

  return {
    problem: null,
    libraryIds: allowed,
    totalItems: items.length,
    dataStats,
    count: matching.length,
    pick: () => (matching.length ? matching[Math.floor(Math.random() * matching.length)] : null),
    breakdown: () => {
      const breakdown: FilterBreakdown[] = [];
      let emptyReason: string | null = null;
      let current = items;
      for (const predicate of active) {
        const beforeCount = current.length;
        current = current.filter((item) => predicate.keep(item));
        const causedEmpty = beforeCount > 0 && current.length === 0;
        breakdown.push({
          filterName: predicate.name,
          label: predicate.label,
          beforeCount,
          afterCount: current.length,
          itemsRemoved: beforeCount - current.length,
          causedEmpty,
        });
        if (causedEmpty && !emptyReason) emptyReason = predicate.emptyReason();
      }
      return { breakdown, emptyReason };
    },
  };
}
