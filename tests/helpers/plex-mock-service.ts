/**
 * Mock Plex Service Implementation for E2E Tests
 *
 * This is a test-only implementation that provides mock responses for Plex API calls.
 * It is NEVER imported by production code - only used through the factory when E2E_MOCK_PLEX is true.
 */

import type {
  PlexUser,
  PlexServer,
  PlexLibrary,
  PlexCollection,
  PlexItem,
} from '@/lib/services/plex';

const E2E_MOCK_USER: PlexUser = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};

const E2E_MOCK_SERVERS: PlexServer[] = [
  {
    name: 'E2E Server',
    clientIdentifier: 'e2e-machine',
    owned: true,
    connections: [
      { uri: 'http://192.168.1.10:32400', local: true, relay: false },
    ],
  },
];

export class MockPlexService {
  constructor(
    private authToken: string,
    private serverUrl?: string
  ) {}

  async validateToken(): Promise<{ valid: boolean; user?: PlexUser; error?: string }> {
    return { valid: true, user: E2E_MOCK_USER };
  }

  async getServers(): Promise<PlexServer[]> {
    return E2E_MOCK_SERVERS;
  }

  async getLibraries(): Promise<PlexLibrary[]> {
    return [
      {
        id: '1',
        title: 'Movies',
        type: 'movie',
        agent: 'com.plexapp.agents.themoviedb',
        scanner: 'Plex Movie',
        language: 'en',
        uuid: 'e2e-library-uuid',
      },
    ];
  }

  async getCollections(): Promise<PlexCollection[]> {
    return [];
  }

  async getLibraryItems(): Promise<PlexItem[]> {
    return [];
  }

  setServerUrl(url: string): void {
    this.serverUrl = url;
  }
}
