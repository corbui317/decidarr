import {
  libraryItemsParamsSchema,
  libraryItemsQuerySchema,
  libraryItemsResponseSchema,
} from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { DomainError } from '@/lib/request/errors';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { itemsFor, syncLibrary } from '@/lib/library/store';
import { sanitizeLibraryItemForClient } from '@/lib/plex-image';

export const GET = route(
  {
    access: 'user',
    params: libraryItemsParamsSchema,
    query: libraryItemsQuerySchema,
    response: libraryItemsResponseSchema,
  },
  async ({ session, params, query, reply }) => {
    const { id } = params;
    const forceRefresh = query.forceRefresh === 'true';

    const settings = await getOrCreateSettings();
    const access = {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    };
    const allowed = await getAccessibleLibraryIds(access, [id]);
    if (!allowed.includes(id)) {
      throw new DomainError('FORBIDDEN', 'Library not found or access denied');
    }

    if (forceRefresh) {
      await syncLibrary(access, id);
    }
    const view = await itemsFor(access, { libraryIds: [id] });

    return reply({
      items: view.items.map(sanitizeLibraryItemForClient),
      fromCache: !forceRefresh && view.fromCache,
      lastSyncedAt: view.lastSyncedAt,
    });
  }
);
