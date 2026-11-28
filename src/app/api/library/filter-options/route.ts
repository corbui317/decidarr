import { libraryFilterOptionsResponseSchema, libraryIdsQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { facets } from '@/lib/library/store';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route(
  { access: 'user', query: libraryIdsQuerySchema, response: libraryFilterOptionsResponseSchema },
  async ({ session, query, reply }) => {
    const libraryIds = query.libraryIds?.split(',') ?? [];

    if (libraryIds.length === 0) {
      return reply({
        contentRatings: [],
        hasRatings: false,
        ratingRange: { min: 0, max: 10 },
        studios: [],
      });
    }

    const settings = await getOrCreateSettings();
    const access = {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    };
    const { contentRatings, studios, ratingRange } = await facets(
      access,
      await getAccessibleLibraryIds(access, libraryIds)
    );

    return reply({
      contentRatings,
      hasRatings: ratingRange !== null,
      ratingRange: ratingRange ?? { min: 0, max: 10 },
      studios,
    });
  }
);
