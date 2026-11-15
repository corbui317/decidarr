/**
 * E2E Mock Data
 *
 * This module contains ONLY E2E mock data and is imported ONLY when E2E_MOCK_PLEX=true.
 * Keeping this separate from production service logic isolates test-only concerns.
 */

export const E2E_MOCK_USER = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};

export const E2E_MOCK_SERVERS = [
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

export const E2E_MOCK_OAUTH_USER = {
  id: 'e2e-user',
  username: 'e2euser',
  email: 'e2e@example.com',
};
