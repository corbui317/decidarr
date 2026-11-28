import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHENTICATED' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function plexSignInRequiredResponse(): Response {
  return new Response(
    JSON.stringify({ error: 'Your Plex access to this server has stopped working.', code: 'PLEX_SIGN_IN_REQUIRED' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('onAuthError (clean signed-out state on revocation, criterion 5)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorizedResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notifies every subscriber when any authenticated call, not just /auth/me, gets a 401', async () => {
    const { libraryApi, onAuthError, isAuthError } = await import('@/lib/api');
    const heard: boolean[] = [];
    const unsubscribeA = onAuthError(() => heard.push(true));
    const unsubscribeB = onAuthError(() => heard.push(true));

    // A dashboard call unrelated to /auth/me or the scheduled refresh.
    await expect(libraryApi.getSections()).rejects.toSatisfy(isAuthError);

    expect(heard).toEqual([true, true]);
    unsubscribeA();
    unsubscribeB();
  });

  it('stops notifying a subscriber once it unsubscribes', async () => {
    const { libraryApi, onAuthError, isAuthError } = await import('@/lib/api');
    const heard: boolean[] = [];
    const unsubscribe = onAuthError(() => heard.push(true));
    unsubscribe();

    await expect(libraryApi.getSections()).rejects.toSatisfy(isAuthError);

    expect(heard).toEqual([]);
  });

  it('does not notify subscribers for a PLEX_SIGN_IN_REQUIRED 401, which leaves the Decidarr session itself valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(plexSignInRequiredResponse()));
    const { libraryApi, onAuthError, isAuthError } = await import('@/lib/api');
    const heard: boolean[] = [];
    const unsubscribe = onAuthError(() => heard.push(true));

    // Still converted to an AuthError, since components like LibrarySelector key
    // their own local "Sign in again" UI off isAuthError() too - only the global,
    // whole-app sign-out must be skipped for this specific code.
    await expect(libraryApi.getSections()).rejects.toSatisfy(isAuthError);

    expect(heard).toEqual([]);
    unsubscribe();
  });
});
