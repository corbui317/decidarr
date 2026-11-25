/**
 * Fakes Plex, plex.tv, Tautulli, Overseerr and TMDb at the integration
 * client's injected fetch and DNS lookup, and records what was sent.
 */
import {
  setIntegrationTransportForTests,
  type IntegrationFetch,
  type IntegrationLookup,
} from '@/lib/integrations/client';

/** TEST-NET-3: a public address that is never routed, used as every hostname's DNS answer by default. */
export const TEST_PUBLIC_ADDRESS = '203.0.113.10';

/** Offline DNS: `localhost` is loopback, every other hostname is public. */
export const publicLookup: IntegrationLookup = async (hostname) => [
  { address: hostname === 'localhost' ? '127.0.0.1' : TEST_PUBLIC_ADDRESS, family: 4 },
];

/** Answers each lookup with the next of `answers`, repeating the last one. */
export function sequenceLookup(...answers: string[][]): IntegrationLookup & { calls: string[] } {
  const calls: string[] = [];
  const lookup = async (hostname: string) => {
    calls.push(hostname);
    const answer = answers.length > 1 ? answers.shift()! : answers[0];
    return answer.map((address) => ({ address, family: address.includes(':') ? (6 as const) : (4 as const) }));
  };
  return Object.assign(lookup, { calls });
}

export interface SentRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: string;
  /** The address the connection was pinned to. */
  address: string;
}

export type FakeHandler = (request: SentRequest) => Response | Promise<Response>;

/** The default for every test: an outbound request nobody faked fails loudly instead of reaching the network. */
export const refuseUnfakedRequests: IntegrationFetch = async ({ method, url }) => {
  throw new Error(`Unexpected ${method} ${url.origin}${url.pathname}: fake it with fakeIntegrations()`);
};

/** Routes every integration request to `handle` for the rest of the test. */
export function fakeIntegrations(
  handle: FakeHandler,
  lookup: IntegrationLookup = publicLookup
): { sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  setIntegrationTransportForTests({
    lookup,
    fetch: async ({ url, method, headers, body, address }) => {
      const request = { url, method, headers, body, address: address.address };
      sent.push(request);
      return handle(request);
    },
  });
  return { sent };
}

/** A redirect to another host, as a hostile or misconfigured integration would send. */
export function redirectTo(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

/** The plex.tv account the fake signs in as. */
export const FAKE_PLEX_ACCOUNT = { id: 'e2e-user', username: 'e2euser', email: 'e2e@example.com' } as const;

/**
 * A plex.tv that signs `account` in and lists one owned server at `serverUri`,
 * plus a Plex server there with one movie library.
 */
export function fakePlex(options: { serverUri: string; machineId: string; account?: typeof FAKE_PLEX_ACCOUNT }): FakeHandler {
  const account = options.account ?? FAKE_PLEX_ACCOUNT;
  const serverOrigin = new URL(options.serverUri).origin;
  return ({ url }) => {
    if (url.origin === 'https://plex.tv') {
      if (url.pathname === '/api/v2/user') return Response.json(account);
      if (url.pathname === '/api/v2/resources') {
        return Response.json([
          {
            name: 'Fake Server',
            provides: 'server',
            clientIdentifier: options.machineId,
            owned: true,
            connections: [{ uri: options.serverUri, local: true, relay: false }],
          },
        ]);
      }
    }
    if (url.origin === serverOrigin && url.pathname === '/library/sections') {
      return Response.json({
        MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie', uuid: 'fake-library' }] },
      });
    }
    return new Response('not found', { status: 404 });
  };
}
