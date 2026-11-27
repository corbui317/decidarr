import { NextResponse } from 'next/server';
import { route } from '@/lib/request/route';
import { resolveSession } from '@/lib/request/session';
import { clearSessionCookie } from '@/lib/auth-login';
import { invalidateAccessibleLibraryCache } from '@/lib/auth';

export const DELETE = route({ access: 'public' }, async ({ request }) => {
  try {
    const session = await resolveSession(request);
    invalidateAccessibleLibraryCache(String(session.userId));
  } catch {
    // Session may already be invalid; still clear the cookie.
  }

  await clearSessionCookie();
  return NextResponse.json({ message: 'Logged out successfully' });
});
