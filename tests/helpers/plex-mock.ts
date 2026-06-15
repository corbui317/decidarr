import { vi } from 'vitest';
import type { PlexService } from '@/lib/services/plex';

export function mockPlexService(overrides?: Partial<{
  validateToken: ReturnType<typeof vi.fn>;
  getServers: ReturnType<typeof vi.fn>;
  getLibrarySections: ReturnType<typeof vi.fn>;
  getCollectionItems: ReturnType<typeof vi.fn>;
  getItemMetadata: ReturnType<typeof vi.fn>;
  fetchMachineIdFromServer: ReturnType<typeof vi.fn>;
  buildPlayLinks: ReturnType<typeof vi.fn>;
}>) {
  const defaults = {
    validateToken: vi.fn().mockResolvedValue({
      valid: true,
      user: { username: 'testuser', email: 'test@example.com' },
    }),
    getServers: vi.fn().mockResolvedValue([
      {
        name: 'Home Server',
        clientIdentifier: 'machine-abc',
        connections: [{ uri: 'http://192.168.1.10:32400', local: true }],
      },
    ]),
    getLibrarySections: vi.fn().mockResolvedValue([
      { key: '1', title: 'Movies', type: 'movie' },
    ]),
    getCollectionItems: vi.fn().mockResolvedValue([]),
    getItemMetadata: vi.fn().mockResolvedValue({
      plexId: '1',
      title: 'Test Movie',
      year: 2020,
      type: 'movie',
    }),
    fetchMachineIdFromServer: vi.fn().mockResolvedValue('machine-abc'),
    buildPlayLinks: vi.fn().mockReturnValue({
      web: 'https://app.plex.tv',
      app: 'plex://',
    }),
  };

  const mock = { ...defaults, ...overrides };

  vi.mock('@/lib/services/plex', () => ({
    PlexService: vi.fn().mockImplementation(() => mock),
  }));

  return mock;
}

export type MockPlexService = typeof mockPlexService extends (
  overrides?: infer O
) => infer R
  ? R
  : never;
