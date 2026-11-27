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

/**
 * Answers each request with the handler registered for its origin and path
 * (`https://plex.tv/api/v2/user`), and anything else with 404.
 */
export function routes(handlers: Record<string, FakeHandler>): FakeHandler {
  return (request) => {
    const handler = handlers[`${request.url.origin}${request.url.pathname}`];
    return handler ? handler(request) : new Response('not found', { status: 404 });
  };
}

export const PLEX_TV = 'https://plex.tv';
export const TMDB = 'https://api.themoviedb.org/3';
/** The Plex server URL seedConfiguredSettings() stores. */
export const TEST_PLEX_SERVER = 'http://192.168.1.10:32400';

export interface FakePlexAccount {
  id: string;
  username: string;
  email: string;
  thumb?: string;
}

/** The plex.tv account the E2E and upgrade fakes sign in as. */
export const FAKE_PLEX_ACCOUNT: FakePlexAccount = { id: 'e2e-user', username: 'e2euser', email: 'e2e@example.com' };

export interface FakePlexServer {
  name?: string;
  clientIdentifier: string;
  owned: boolean;
  uri: string;
  /** The account's access token for this one server; defaults to `server-token-<clientIdentifier>`. */
  accessToken?: string;
}

/** The access token plexResources() hands out for a server when the test names none. */
export function defaultServerToken(clientIdentifier: string): string {
  return `server-token-${clientIdentifier}`;
}

/** plex.tv's resource list: the servers an account can reach. */
export function plexResources(servers: FakePlexServer[]): Response {
  return Response.json(
    servers.map(({ name, clientIdentifier, owned, uri, accessToken }) => ({
      name: name ?? 'Fake Server',
      provides: 'server',
      clientIdentifier,
      owned,
      accessToken: accessToken ?? defaultServerToken(clientIdentifier),
      connections: [{ uri, local: true, relay: false }],
    }))
  );
}

/** A Plex server's library sections. */
export function plexSections(sections: { id: string; title: string; type: string }[]): Response {
  return Response.json({
    MediaContainer: { Directory: sections.map(({ id, ...rest }) => ({ key: id, uuid: `uuid-${id}`, ...rest })) },
  });
}

/** A Plex server's metadata list (library items, a collection's children, one item's details). */
export function plexMetadata(items: { ratingKey: string; title: string; year?: number; type?: string }[]): Response {
  return Response.json({ MediaContainer: { Metadata: items } });
}

/** A Plex server's full listing of a library section, as /library/sections/<id>/all returns it. */
export function plexLibraryItems(
  items: {
    plexId: string;
    title: string;
    year?: number;
    genres?: string[];
    contentRating?: string;
    studio?: string;
    rating?: number;
    thumbPath?: string;
    type?: string;
  }[]
): Response {
  return Response.json({
    MediaContainer: {
      Metadata: items.map(({ plexId, genres, thumbPath, type, ...rest }) => ({
        ratingKey: plexId,
        type: type ?? 'movie',
        thumb: thumbPath,
        Genre: genres?.map((tag) => ({ tag })),
        ...rest,
      })),
    },
  });
}

export interface FakePlexTvOptions {
  /** The PIN that POST /api/v2/pins creates. */
  pin?: { id: number; code: string };
  /** The token a PIN poll returns once the user approved it; null while waiting. */
  authToken?: string | null;
  /** The account behind any token. */
  account?: FakePlexAccount;
  servers?: FakePlexServer[];
  friends?: { id: string; username: string; thumb?: string }[];
}

/** plex.tv: PIN sign-in, the signed-in account, its servers and its friends. */
export function fakePlexTv(options: FakePlexTvOptions = {}): FakeHandler {
  return ({ url, method }) => {
    if (url.origin !== PLEX_TV) return new Response('not found', { status: 404 });
    if (method === 'POST' && url.pathname === '/api/v2/pins') {
      return Response.json(options.pin ?? { id: 123, code: 'ABC123' });
    }
    const pinId = url.pathname.match(/^\/api\/v2\/pins\/(\d+)$/)?.[1];
    if (pinId) {
      return Response.json({ id: Number(pinId), code: url.searchParams.get('code'), authToken: options.authToken ?? null });
    }
    if (url.pathname === '/api/v2/user') return Response.json(options.account ?? FAKE_PLEX_ACCOUNT);
    if (url.pathname === '/api/v2/resources') return plexResources(options.servers ?? []);
    if (url.pathname === '/api/v2/friends') return Response.json(options.friends ?? []);
    return new Response('not found', { status: 404 });
  };
}

/**
 * plex.tv signing `account` in with any token and listing one owned server at
 * `serverUri`, plus that server with one movie library.
 */
export function fakePlex(options: { serverUri: string; machineId: string; account?: FakePlexAccount }): FakeHandler {
  const plexTv = fakePlexTv({
    account: options.account,
    servers: [{ clientIdentifier: options.machineId, owned: true, uri: options.serverUri }],
  });
  const server = routes({
    [`${new URL(options.serverUri).origin}/library/sections`]: () =>
      plexSections([{ id: '1', title: 'Movies', type: 'movie' }]),
  });
  return (request) => (request.url.origin === PLEX_TV ? plexTv(request) : server(request));
}

/** Tautulli's envelope around a command's data. */
export function tautulliResponse(data: unknown): Response {
  return Response.json({ response: { result: 'success', data } });
}
