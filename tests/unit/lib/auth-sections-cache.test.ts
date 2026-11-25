import { describe, it, expect, beforeEach } from 'vitest';
import type { Types } from 'mongoose';
import type { AuthContext } from '@/lib/auth';
import { fakeIntegrations, plexSections, type SentRequest } from '../../helpers/fake-integrations';

import {
  getAccessibleLibraryIds,
  invalidateAccessibleLibraryCache,
} from '@/lib/auth';

function createAuthContext(overrides?: Partial<AuthContext>): AuthContext {
  return {
    user: { _id: 'user-123' as unknown as Types.ObjectId } as AuthContext['user'],
    settings: { plexMachineId: 'machine-1' } as AuthContext['settings'],
    plexToken: 'token',
    plexServerUrl: 'http://plex.local:32400',
    isAdmin: false,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

describe('getAccessibleLibraryIds sections cache', () => {
  let sent: SentRequest[];
  const sectionRequests = () => sent.filter((r) => r.url.pathname === '/library/sections').length;

  beforeEach(() => {
    invalidateAccessibleLibraryCache();
    ({ sent } = fakeIntegrations(() =>
      plexSections([
        { id: 'lib-1', title: 'Movies', type: 'movie' },
        { id: 'lib-2', title: 'TV', type: 'show' },
        { id: 'lib-3', title: 'Music', type: 'artist' },
      ])
    ));
  });

  it('calls Plex only once per user during rapid repeated requests', async () => {
    const auth = createAuthContext();

    await getAccessibleLibraryIds(auth);
    await getAccessibleLibraryIds(auth);
    await getAccessibleLibraryIds(auth);

    expect(sectionRequests()).toBe(1);
  });

  it('filters requested library ids from cached section list', async () => {
    const auth = createAuthContext();

    const result = await getAccessibleLibraryIds(auth, ['lib-1', 'lib-3', 'missing']);

    expect(result).toEqual(['lib-1']);
    await getAccessibleLibraryIds(auth, ['lib-2']);
    expect(sectionRequests()).toBe(1);
  });

  it('invalidates cached sections for a user', async () => {
    const auth = createAuthContext();

    await getAccessibleLibraryIds(auth);
    invalidateAccessibleLibraryCache(String(auth.user._id));
    await getAccessibleLibraryIds(auth);

    expect(sectionRequests()).toBe(2);
  });

  it('uses separate cache entries per machine id', async () => {
    const auth = createAuthContext();

    await getAccessibleLibraryIds(auth);
    await getAccessibleLibraryIds(
      createAuthContext({
        settings: { plexMachineId: 'machine-2' } as AuthContext['settings'],
      })
    );

    expect(sectionRequests()).toBe(2);
  });
});
