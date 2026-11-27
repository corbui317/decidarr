import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { fetchPlexFriends } from '@/lib/services/plex-oauth';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:AdminUsers');

export const GET = route({ access: 'admin' }, async ({ session }) => {
  const settings = await getOrCreateSettings();
  const friends = await fetchPlexFriends(session.plex.token);
  const dbUsers = await User.find({ isAdmin: false }).lean();
  const approvedSet = new Set(settings.approvedPlexUserIds || []);

  const friendMap = new Map(
    friends.map((f) => [f.id, { ...f, hasServerAccess: true, isApproved: approvedSet.has(f.id) }])
  );

  for (const u of dbUsers) {
    if (!friendMap.has(u.plexUserId)) {
      friendMap.set(u.plexUserId, {
        id: u.plexUserId,
        username: u.plexUsername || u.plexUserId,
        thumb: u.plexThumb,
        hasServerAccess: true,
        isApproved: u.isApproved || approvedSet.has(u.plexUserId),
      });
    }
  }

  const users = Array.from(friendMap.values()).sort((a, b) =>
    a.username.localeCompare(b.username)
  );

  logger.debug('Listed users', { count: users.length });
  return NextResponse.json({ users });
});
