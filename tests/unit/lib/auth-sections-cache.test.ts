import { describe, it, expect, beforeEach, vi } from 'vitest';

const plexMock = {
  getLibrarySections: vi.fn(),
};

vi.mock('@/lib/services/plex', () => ({
  PlexService: vi.fn(function PlexServiceMock() {
    return plexMock;
  }),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateAccessibleLibraryCache();
    plexMock.getLibrarySections.mockResolvedValue([
      { id: 'lib-1', title: 'Movies', type: 'movie' },
      { id: 'lib-2', title: 'TV', type: 'show' },
      { id: 'lib-3', title: 'Music', type: 'artist' },
    ]);
  });

  it('calls Plex only once per user during rapid repeated requests', async () => {
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(access);

    expect(plexMock.getLibrarySections).toHaveBeenCalledTimes(1);
  });

  it('filters requested library ids from cached section list', async () => {
    const access = createAccess();

    const result = await getAccessibleLibraryIds(access, ['lib-1', 'lib-3', 'missing']);

    expect(result).toEqual(['lib-1']);
    await getAccessibleLibraryIds(access, ['lib-2']);
    expect(plexMock.getLibrarySections).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached sections for a user', async () => {
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    invalidateAccessibleLibraryCache(access.userId);
    await getAccessibleLibraryIds(access);

    expect(plexMock.getLibrarySections).toHaveBeenCalledTimes(2);
  });

  it('uses separate cache entries per machine id', async () => {
    const access = createAccess();

    await getAccessibleLibraryIds(access);
    await getAccessibleLibraryIds(createAccess({ plexMachineId: 'machine-2' }));

    expect(plexMock.getLibrarySections).toHaveBeenCalledTimes(2);
  });
});
