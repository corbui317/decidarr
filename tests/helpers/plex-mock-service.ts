/**
 * Mock Plex Service Implementation for E2E Tests
 *
 * This is a test-only implementation that provides mock responses for Plex API calls.
 * Imported only when NODE_ENV !== 'production' && E2E_MOCK_PLEX === 'true'.
 * Production builds dead-code-eliminate the import because Next.js inlines
 * NODE_ENV as a literal, and the webpack alias stubs this file to ensure
 * it never reaches the bundle.
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
    private serverUrl?: string | null,
    private machineId?: string | null
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

  async getLibrarySections(): Promise<PlexLibrary[]> {
    return this.getLibraries();
  }

  async fetchMachineIdFromServer(): Promise<string | null> {
    return 'e2e-machine';
  }

  async getCollections(_sectionId: string): Promise<PlexCollection[]> {
    return [];
  }

  async getCollectionItems(_collectionRatingKey: string): Promise<PlexItem[]> {
    return [];
  }

  async getLibraryItems(_sectionId: string): Promise<PlexItem[]> {
    return [];
  }

  async getItemMetadata(ratingKey: string): Promise<PlexItem> {
    return {
      plexId: ratingKey,
      title: 'Mock Item',
      year: 2024,
      type: 'movie',
      thumb: '/library/metadata/1/thumb',
      art: '/library/metadata/1/art',
      summary: 'Mock summary for E2E testing',
      rating: 7.5,
      contentRating: 'PG-13',
      duration: 7200000,
      originallyAvailableAt: '2024-01-01',
      addedAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    } as PlexItem;
  }

  async getShowEpisodes(_showRatingKey: string): Promise<Record<string, unknown>[]> {
    return [];
  }

  buildPlayLinks(ratingKey: string): {
    plex: string;
    app: string;
  } {
    const baseUrl = this.serverUrl || 'http://192.168.1.10:32400';
    return {
      plex: `${baseUrl}/web/index.html#!/server/e2e-machine/details?key=/library/metadata/${ratingKey}`,
      app: `plex://preplay/?metadataKey=/library/metadata/${ratingKey}&server=e2e-machine`,
    };
  }

  setServerUrl(url: string): void {
    this.serverUrl = url;
  }
}
