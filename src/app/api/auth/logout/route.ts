import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth-login';
import { invalidateAccessibleLibraryCache, requireUser } from '@/lib/auth';

export async function DELETE() {
  try {
    const auth = await requireUser();
    invalidateAccessibleLibraryCache(String(auth.user._id));
  } catch {
    // Session may already be invalid; still clear the cookie.
  }

  await clearSessionCookie();
  return NextResponse.json({ message: 'Logged out successfully' });
}
