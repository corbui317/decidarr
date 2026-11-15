/**
 * E2E Mock Implementations for Plex Services
 *
 * These mock implementations are ONLY loaded when E2E_MOCK_PLEX=true.
 * Production code should have no direct references to E2E mock data.
 */

export interface PlexUser {
  id: string;
  username: string;
  email: string;
  thumb?: string;
}

export interface PlexServer {
  name: string;
  clientIdentifier: string;
  owned: boolean;
  connections: { uri: string; local: boolean; relay: boolean }[];
}

export interface PlexPin {
  id: number;
  code: string;
  authToken?: string;
}

export interface PlexOAuthUser {
  id: string;
  username: string;
  email: string;
  thumb?: string;
}

// E2E Mock Data
export const E2E_MOCK_USER: PlexUser = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};

export const E2E_MOCK_SERVERS: PlexServer[] = [
  {
    name: 'E2E Server',
    clientIdentifier: 'e2e-machine',
    owned: true,
    connections: [
      { uri: 'http://192.168.1.10:32400', local: true, relay: false },
    ],
  },
];

export const E2E_MOCK_PIN_ID = 424242;
export const E2E_MOCK_PIN_CODE = 'e2e-mock-pin-code';
export const E2E_MOCK_AUTH_TOKEN = 'e2e-test-plex-token-valid';

export const E2E_MOCK_OAUTH_USER: PlexOAuthUser = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};

// Mock service methods
export function getMockPlexUser(): PlexUser {
  return E2E_MOCK_USER;
}

export function getMockPlexServers(): PlexServer[] {
  return E2E_MOCK_SERVERS;
}

export function getMockAuthPin(): PlexPin {
  return { id: E2E_MOCK_PIN_ID, code: E2E_MOCK_PIN_CODE };
}

export function getMockAuthToken(): string {
  return E2E_MOCK_AUTH_TOKEN;
}

export function getMockOAuthUser(): PlexOAuthUser {
  return E2E_MOCK_OAUTH_USER;
}
