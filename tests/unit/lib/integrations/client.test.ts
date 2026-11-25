import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi } from 'vitest';
import {
  createIntegrationClient,
  IntegrationError,
  nodeTransport,
  type IntegrationClientOptions,
  type IntegrationFetch,
} from '@/lib/integrations/client';
import { sequenceLookup } from '../../../helpers/fake-integrations';

const PUBLIC = '93.184.216.34';

function client(overrides: Partial<IntegrationClientOptions> = {}) {
  return createIntegrationClient({
    integration: 'Tautulli',
    baseUrl: 'http://tautulli.example:8181/base/',
    timeoutMs: 1_000,
    urlPolicy: { allowPrivateNetworks: false },
    lookup: sequenceLookup([PUBLIC]),
    ...overrides,
  });
}

describe('createIntegrationClient', () => {
  it('checks every resolved address and refuses the request if any is blocked', async () => {
    const fetch = vi.fn<IntegrationFetch>();

    const error = await client({ fetch, lookup: sequenceLookup([PUBLIC, '10.1.2.3']) })
      .request('/api')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IntegrationError);
    expect(error).toMatchObject({ integration: 'Tautulli', reason: 'blocked_address', unavailable: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves at request time, so a rebound answer is refused even after a good one', async () => {
    const fetch = vi.fn<IntegrationFetch>(async () => new Response('ok'));
    const lookup = sequenceLookup([PUBLIC], ['127.0.0.1']);
    const tautulli = client({ fetch, lookup });

    await expect(tautulli.request('/first')).resolves.toBeInstanceOf(Response);
    await expect(tautulli.request('/second')).rejects.toMatchObject({ reason: 'blocked_address' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('allows private addresses only with the opt-in', async () => {
    const fetch = vi.fn<IntegrationFetch>(async () => new Response('ok'));
    const lan = { baseUrl: 'http://192.168.1.20:8181', fetch };

    await expect(client(lan).request('/')).rejects.toMatchObject({ reason: 'blocked_address' });
    await expect(client({ ...lan, urlPolicy: { allowPrivateNetworks: true } }).request('/')).resolves.toBeInstanceOf(
      Response
    );
  });

  it('pins the request to the checked address and sends auth, headers and query', async () => {
    const fetch = vi.fn<IntegrationFetch>(async () => new Response('ok'));

    await client({
      fetch,
      auth: { query: 'apikey', value: 'secret key' },
      headers: { Accept: 'application/json' },
    }).request('/api/v2', { query: { cmd: 'get_users' }, headers: { 'X-Extra': '1' } });

    const sent = fetch.mock.calls[0][0];
    expect(sent.address).toEqual({ address: PUBLIC, family: 4 });
    expect(sent.url.toString()).toBe('http://tautulli.example:8181/base/api/v2?cmd=get_users&apikey=secret+key');
    expect(sent.headers.get('accept')).toBe('application/json');
    expect(sent.headers.get('x-extra')).toBe('1');
  });

  it('sends header auth and checks IP literals without DNS', async () => {
    const fetch = vi.fn<IntegrationFetch>(async () => new Response('ok'));
    const lookup = sequenceLookup([PUBLIC]);

    await client({
      fetch,
      lookup,
      baseUrl: 'http://[::ffff:5db8:d822]:8181',
      auth: { header: 'X-Api-Key', value: 'k' },
    }).request('/');

    expect(lookup.calls).toEqual([]);
    expect(fetch.mock.calls[0][0].address).toEqual({ address: PUBLIC, family: 4 });
    expect(fetch.mock.calls[0][0].headers.get('x-api-key')).toBe('k');
  });

  it('refuses an IPv4-mapped IPv6 loopback literal', async () => {
    await expect(client({ baseUrl: 'http://[::ffff:7f00:1]:8181' }).request('/')).rejects.toMatchObject({
      reason: 'blocked_address',
    });
  });

  it('turns every 3xx into an integration error and never follows it', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const fetch = vi.fn<IntegrationFetch>(async () => new Response(null, { status, headers: { location: 'http://evil/' } }));

      await expect(client({ fetch }).request('/')).rejects.toMatchObject({ reason: 'redirect', status });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('reports a timeout when the integration does not answer in time', async () => {
    const fetch: IntegrationFetch = ({ signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));

    await expect(client({ fetch, timeoutMs: 20 }).request('/')).rejects.toMatchObject({
      reason: 'timeout',
      unavailable: true,
    });
  });

  it('reports network and DNS failures as unavailable', async () => {
    const fetch: IntegrationFetch = async () => {
      throw new TypeError('socket hang up');
    };
    const noDns = async () => {
      throw new Error('ENOTFOUND');
    };

    await expect(client({ fetch }).request('/')).rejects.toMatchObject({ reason: 'network', unavailable: true });
    await expect(client({ lookup: noDns }).request('/')).rejects.toMatchObject({
      reason: 'unresolvable',
      unavailable: true,
    });
  });

  it('json() returns the body of a 2xx and reports any other status as an integration error', async () => {
    const statuses = [200, 401, 503];
    const fetch: IntegrationFetch = async () => Response.json({ ok: true }, { status: statuses.shift() });
    const tautulli = client({ fetch });

    await expect(tautulli.json('/')).resolves.toEqual({ ok: true });
    await expect(tautulli.json('/')).rejects.toMatchObject({ reason: 'http_status', status: 401, unavailable: false });
    await expect(tautulli.json('/')).rejects.toMatchObject({ reason: 'http_status', status: 503, unavailable: true });
  });

  it('json() reports a body that is not JSON', async () => {
    const fetch: IntegrationFetch = async () => new Response('<html>');

    await expect(client({ fetch }).json('/')).rejects.toMatchObject({ reason: 'bad_response' });
  });

  it('refuses URLs with credentials or a non-http scheme', async () => {
    await expect(client({ baseUrl: 'http://user:pass@tautulli.example' }).request('/')).rejects.toMatchObject({
      reason: 'invalid_url',
    });
    await expect(client({ baseUrl: 'ftp://tautulli.example' }).request('/')).rejects.toMatchObject({
      reason: 'invalid_url',
    });
  });
});

describe('nodeTransport', () => {
  async function withServer(
    handler: http.RequestListener,
    run: (port: number) => Promise<void>
  ): Promise<void> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await run((server.address() as AddressInfo).port);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  it('connects to the pinned address without resolving the hostname again', async () => {
    const seen: { host?: string; token?: string; body: string }[] = [];
    await withServer(
      (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          seen.push({ host: req.headers.host, token: req.headers['x-plex-token'] as string, body });
          res.setHeader('content-type', 'application/json');
          res.end('{"ok":true}');
        });
      },
      async (port) => {
        // The hostname does not exist in DNS; only the pinned address can reach the server.
        const response = await nodeTransport({
          url: new URL(`http://plex.does-not-resolve.invalid:${port}/library/sections`),
          method: 'POST',
          headers: new Headers({ 'X-Plex-Token': 't' }),
          body: 'a=1',
          signal: AbortSignal.timeout(5_000),
          address: { address: '127.0.0.1', family: 4 },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
      }
    );
    expect(seen).toEqual([{ host: expect.stringMatching(/^plex\.does-not-resolve\.invalid:\d+$/), token: 't', body: 'a=1' }]);
  });

  it('returns a redirect as is instead of following it', async () => {
    await withServer(
      (_req, res) => {
        res.statusCode = 302;
        res.setHeader('location', 'http://127.0.0.1:1/elsewhere');
        res.end();
      },
      async (port) => {
        const response = await nodeTransport({
          url: new URL(`http://127.0.0.1:${port}/`),
          method: 'GET',
          headers: new Headers(),
          signal: AbortSignal.timeout(5_000),
          address: { address: '127.0.0.1', family: 4 },
        });

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('http://127.0.0.1:1/elsewhere');
      }
    );
  });
});
