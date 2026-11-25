import { describe, it, expect, beforeEach } from 'vitest';
import { fakeIntegrations, plexSections, type SentRequest } from '../../helpers/fake-integrations';

import {
  getAccessibleLibraryIds,
  invalidateAccessibleLibraryCache,
  type LibraryAccess,
} from '@/lib/auth';

function createAccess(overrides?: Partial<LibraryAccess>): LibraryAccess {
  return {
    userId: 'user-123',
    plexMachineId: 'machine-1',
    plexToken: 'token',
    plexServerUrl: 'http://plex.local:32400',
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
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(access);

    expect(sectionRequests()).toBe(1);
  });

  it('filters requested library ids from cached section list', async () => {
    const access = createAccess();

    const result = await getAccessibleLibraryIds(access, ['lib-1', 'lib-3', 'missing']);

    expect(result).toEqual(['lib-1']);
    await getAccessibleLibraryIds(access, ['lib-2']);
    expect(sectionRequests()).toBe(1);
  });

  it('invalidates cached sections for a user', async () => {
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    invalidateAccessibleLibraryCache(access.userId);
    await getAccessibleLibraryIds(access);

    expect(sectionRequests()).toBe(2);
  });

  it('uses separate cache entries per machine id', async () => {
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(createAccess({ plexMachineId: 'machine-2' }));

    expect(sectionRequests()).toBe(2);
  });
});
