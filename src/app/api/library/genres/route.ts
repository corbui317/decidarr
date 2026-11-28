import { libraryGenresResponseSchema, libraryIdsQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { facets } from '@/lib/library/store';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route(
  { access: 'user', query: libraryIdsQuerySchema, response: libraryGenresResponseSchema },
  async ({ session, query, reply }) => {
    const ids = query.libraryIds
      ? query.libraryIds.split(',').filter((id) => /^[0-9a-zA-Z-]+$/.test(id.trim()))
      : [];

    if (ids.length === 0) {
      return reply({ genres: [] });
    }

    const settings = await getOrCreateSettings();
    const access = {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    };
    const { genres } = await facets(access, await getAccessibleLibraryIds(access, ids));

    return reply({ genres });
  }
);
