import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireAdmin, isAuthError, authErrorStatus } from '@/lib/auth';
import { User } from '@/lib/models/User';
import { fetchPlexFriends } from '@/lib/services/plex-oauth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('API:AdminUsers');

export async function GET() {
  try {
    await connectDB();
    const { settings, plexToken } = await requireAdmin();

    const friends = await fetchPlexFriends(plexToken);
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
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: authErrorStatus(error) }
      );
    }
    logger.error('List users failed', { error: (error as Error).message });
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}
