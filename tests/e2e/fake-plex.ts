/**
 * Real HTTP servers on loopback that stand in for plex.tv and a Plex Media
 * Server during E2E. The app reaches them through its integration client and
 * URL policy like any other service: PLEX_TV_URL points plex.tv here, and the
 * private-address opt-in lets loopback through.
 */
import http from 'http';
import {
  PLEX_TV,
  defaultServerToken,
  fakePlexTv,
  plexMetadata,
  plexSections,
  routes,
  type FakeHandler,
} from '../helpers/fake-integrations';
import { E2E_PLEX_SERVER_URL, E2E_PLEX_TV_URL } from './e2e-env';

export const E2E_MACHINE_ID = 'e2e-machine';

const plexTv = fakePlexTv({
  authToken: 'e2e-plex-token',
  servers: [{ name: 'E2E Server', clientIdentifier: E2E_MACHINE_ID, owned: true, uri: E2E_PLEX_SERVER_URL }],
});

const plexLibrary = routes({
  [`${E2E_PLEX_SERVER_URL}/identity`]: () => Response.json({ MediaContainer: { machineIdentifier: E2E_MACHINE_ID } }),
  [`${E2E_PLEX_SERVER_URL}/library/sections`]: () => plexSections([{ id: '1', title: 'Movies', type: 'movie' }]),
  [`${E2E_PLEX_SERVER_URL}/library/sections/1/all`]: () => plexMetadata([]),
  [`${E2E_PLEX_SERVER_URL}/library/sections/1/collections`]: () => plexMetadata([]),
});

/** The access token plex.tv hands out for the fake server; the server refuses every other token. */
export const E2E_SERVER_TOKEN = defaultServerToken(E2E_MACHINE_ID);

/**
 * The library above, plus details for any item a spin picks (the specs seed the items into the library cache).
 * Like a real Plex server it answers only its own access token, so a plex.tv account token gets a 401.
 */
const plexServer: FakeHandler = (request) => {
  if (request.url.pathname !== '/identity' && request.headers.get('x-plex-token') !== E2E_SERVER_TOKEN) {
    return new Response('Unauthorized', { status: 401 });
  }
  const ratingKey = request.url.pathname.match(/^\/library\/metadata\/([^/]+)$/)?.[1];
  return ratingKey ? plexMetadata([{ ratingKey, title: `Fake Movie ${ratingKey}`, type: 'movie' }]) : plexLibrary(request);
};

/** Serves `handle` on `listenUrl`, presenting each request to it as sent to `origin`. */
function serve(listenUrl: string, origin: string, handle: FakeHandler): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const response = await handle({
      url: new URL(req.url ?? '/', origin),
      method: req.method ?? 'GET',
      headers,
      body: chunks.length ? Buffer.concat(chunks).toString() : undefined,
      address: req.socket.localAddress ?? '',
    });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  const { hostname, port } = new URL(listenUrl);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), hostname, () => resolve(server));
  });
}

/** Starts both fakes; resolves to a function that stops them. */
export async function startFakePlex(): Promise<() => Promise<void>> {
  const servers = await Promise.all([
    serve(E2E_PLEX_TV_URL, PLEX_TV, plexTv),
    serve(E2E_PLEX_SERVER_URL, E2E_PLEX_SERVER_URL, plexServer),
  ]);
  return async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  };
}
