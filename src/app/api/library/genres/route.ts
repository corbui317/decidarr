import { NextResponse } from 'next/server';
import { libraryIdsQuerySchema } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache } from '@/lib/models/LibraryCache';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user', query: libraryIdsQuerySchema }, async ({ session, query }) => {
  const ids = query.libraryIds
    ? query.libraryIds.split(',').filter((id) => /^[0-9a-zA-Z-]+$/.test(id.trim()))
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ genres: [] });
  }

  const settings = await getOrCreateSettings();
  const allowed = await getAccessibleLibraryIds(
    {
      userId: session.userId.toString(),
      plexToken: session.plex.token,
      plexServerUrl: session.plex.serverUrl,
      plexMachineId: settings.plexMachineId || null,
    },
    ids
  );
  const machineId = settings.plexMachineId || 'unknown';

  const caches = await LibraryCache.find({
    plexMachineId: machineId,
    libraryId: { $in: allowed },
  }).lean();

  const genres = new Set<string>();
  for (const cache of caches) {
    for (const item of cache.items) {
      if (item.genres) {
        item.genres.forEach((g) => genres.add(g));
      }
    }
  }

  return NextResponse.json({ genres: Array.from(genres).sort() });
});
