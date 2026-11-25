import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/request/route';
import { getAccessibleLibraryIds } from '@/lib/auth';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { LibraryCache } from '@/lib/models/LibraryCache';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const yearsQuery = z.object({
  libraryIds: z.string().optional(),
});

export const GET = route({ access: 'user', query: yearsQuery }, async ({ session, query }) => {
  const ids = query.libraryIds
    ? query.libraryIds.split(',').filter((id) => /^[0-9a-zA-Z-]+$/.test(id.trim()))
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ min: 1900, max: new Date().getFullYear() });
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

  const years: number[] = [];
  for (const cache of caches) {
    for (const item of cache.items) {
      if (item.year) years.push(item.year);
    }
  }

  if (years.length === 0) {
    return NextResponse.json({ min: 1900, max: new Date().getFullYear() });
  }

  return NextResponse.json({
    min: Math.min(...years),
    max: Math.max(...years),
  });
});
