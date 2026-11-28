import { adminUsersListResponseSchema, type PlexFriendUser } from '@decidarr/api-contracts';
import { route } from '@/lib/request/route';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { User } from '@/lib/models/User';
import { fetchPlexFriends } from '@/lib/services/plex-oauth';
import { createLogger } from '@/lib/logger';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

const logger = createLogger('API:AdminUsers');

/** The Admin's plex.tv account token, which listing Friends needs; null when it is missing or unreadable. */
async function readAdminAccountToken(userId: unknown): Promise<string | null> {
  try {
    return (await User.findById(userId))?.getAccountToken() ?? null;
  } catch {
    return null;
  }
}

export const GET = route({ access: 'admin', response: adminUsersListResponseSchema }, async ({ session, reply }) => {
  const settings = await getOrCreateSettings();
  const accountToken = await readAdminAccountToken(session.userId);
  if (!accountToken) {
    logger.warn('No readable Plex account token for the Admin; listing local users only');
  }
  const friends = accountToken ? await fetchPlexFriends(accountToken) : [];
  const dbUsers = await User.find({ isAdmin: false }).lean();
  const approvedSet = new Set(settings.approvedPlexUserIds || []);

  const friendMap = new Map<string, PlexFriendUser>();
  for (const f of friends) {
    friendMap.set(f.id, {
      id: f.id,
      username: f.username,
      thumb: f.thumb,
      hasServerAccess: true,
      isApproved: approvedSet.has(f.id),
    });
  }

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
  return reply({ users });
});
