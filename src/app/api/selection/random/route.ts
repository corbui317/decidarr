import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { PlexService } from '@/lib/services/plex';
import { TMDbService } from '@/lib/services/tmdb';
import { loadPool, POOL_PROBLEMS } from '@/lib/selection/pool';
import { recordSpin } from '@/lib/user-data';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';
import { selectionRequestBodySchema } from '@decidarr/api-contracts';
import type { SelectionResultResponse, SelectionError } from '@decidarr/api-contracts';

export const POST = route({ access: 'user', body: selectionRequestBodySchema }, async ({ session, body }) => {
  const { mediaType, filters } = body;
  const tvSelectionMode = mediaType === 'show' ? body.tvSelectionMode : undefined;

  const pool = await loadPool(session, body);
  if (pool.problem) {
    const { status, error, suggestion } = POOL_PROBLEMS[pool.problem];
    const errorResponse: SelectionError = { error, code: pool.problem, ...(suggestion && { suggestion }) };
    return NextResponse.json(errorResponse, { status });
  }

  const picked = pool.pick();
  if (!picked) {
    const errorResponse: SelectionError = {
      error: 'No items match your filters',
      code: 'NO_ITEMS_MATCH_FILTERS',
      suggestion: 'Try adjusting your filters',
    };
    return NextResponse.json(errorResponse, { status: 404 });
  }

  const settings = await getOrCreateSettings();
  const plexService = new PlexService(session.plex.token, session.plex.serverUrl, settings.plexMachineId);
  const fullDetails = await plexService.getItemMetadata(picked.plexId);
  const playLinks = plexService.buildPlayLinks(picked.plexId);

  let tmdbData = null;
  const tmdbApiKey = settings.getDecryptedTmdbKey();
  if (tmdbApiKey) {
    tmdbData = await new TMDbService(tmdbApiKey).matchPlexItem(fullDetails.title, fullDetails.year, mediaType);
  }

  const selection: SelectionResultResponse['selection'] = {
    ...sanitizeLibraryItemForClient({
      ...fullDetails,
      type: fullDetails.type ?? mediaType,
      overseerrStatus: picked.overseerrStatus ?? null,
    }),
    tmdb: tmdbData,
  };

  // The server records every spin it answers, whichever client asked, so clients never record it.
  await recordSpin(session, {
    plexId: selection.plexId,
    title: selection.title,
    mediaType,
    thumbPath: selection.thumbPath,
    year: selection.year,
    libraryIds: pool.libraryIds,
    filtersSnapshot: filters,
    tvSelectionMode,
    poolSizeAtSpin: pool.count,
  });

  const response: SelectionResultResponse = {
    selection,
    playLinks,
    stats: { totalMatches: pool.count },
    tvSelectionMode: body.tvSelectionMode,
  };
  return NextResponse.json(response);
});
