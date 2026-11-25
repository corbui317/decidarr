import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { User } from '@/lib/models/User';
import { getOrCreateSettings } from '@/lib/models/Settings';
import { DomainError } from '@/lib/request/errors';

// Reads the session and database on every request; never prerender at build time.
export const dynamic = 'force-dynamic';

export const GET = route({ access: 'user' }, async ({ session }) => {
  const user = await User.findById(session.userId);
  if (!user) {
    throw new DomainError('UNAUTHENTICATED', 'Unauthorized');
  }
  const settings = await getOrCreateSettings();

  return NextResponse.json({
    user: {
      id: user._id.toString(),
      username: user.plexUsername,
      serverUrl: settings.plexServerUrl,
      thumb: user.plexThumb,
      isAdmin: session.isAdmin,
    },
    preferences: user.preferences,
    expiresAt: session.expiresAt,
  });
});
