import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { resolveSession } from '@/lib/request/session';
import { clearSessionCookie } from '@/lib/auth-login';
import { invalidateAccessibleLibraryCache } from '@/lib/auth';
import { User } from '@/lib/models/User';

export const DELETE = route({ access: 'public' }, async ({ request }) => {
  try {
    const session = await resolveSession(request);
    invalidateAccessibleLibraryCache(String(session.userId));
    // Bumping the session version is what actually ends the session: it makes every
    // outstanding token for this user, including the cookie this very request carried,
    // fail its next verification. Clearing the cookie alone only stops this browser from
    // resending it; a copy captured earlier would otherwise keep working.
    await User.findByIdAndUpdate(session.userId, { $inc: { sessionVersion: 1 } });
  } catch {
    // Session may already be invalid; still clear the cookie.
  }

  await clearSessionCookie();
  return NextResponse.json({ message: 'Logged out successfully' });
});
