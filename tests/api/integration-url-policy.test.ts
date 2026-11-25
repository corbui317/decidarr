import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { clearDatabase } from '../helpers/mongo';
import { authenticateTestSession, clearTestCookies, seedConfiguredSettings } from '../helpers/auth';

const dnsAnswers: string[][] = [];
vi.mock('dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('dns/promises')>();
  const lookup = async () => (dnsAnswers.shift() ?? []).map((address) => ({ address, family: 4 }));
  return { ...actual, default: { ...actual, lookup }, lookup };
});

import { POST as overseerrTestPost } from '@/app/api/overseerr/test/route';
import { OverseerrService } from '@/lib/services/overseerr';
import { PlexService } from '@/lib/services/plex';

interface Seen {
  host: string;
  headers: http.IncomingHttpHeaders;
}

/** A server that redirects every request to `target`, and one that records what reaches it. */
async function startServer(handler: http.RequestListener): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('Integration URL policy at request time', () => {
  beforeEach(async () => {
    await clearDatabase();
    clearTestCookies();
    dnsAnswers.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a hostname that resolves to a blocked address at request time, after passing the save-time check', async () => {
    await seedConfiguredSettings();
    await authenticateTestSession();
    const fetchMock = vi.fn(async () => Response.json({ version: '1.0.0' }));
    vi.stubGlobal('fetch', fetchMock);

    // The save-time check sees a public address; the connection would go to loopback.
    dnsAnswers.push(['93.184.216.34'], ['127.0.0.1'], ['127.0.0.1']);

    const res = await overseerrTestPost(
      new NextRequest('http://localhost/api/overseerr/test', {
        method: 'POST',
        body: JSON.stringify({ url: 'http://overseerr.rebind.example', apiKey: 'overseerr-key' }),
      })
    );
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Integration redirects', () => {
  let seen: Seen[];
  let target: Awaited<ReturnType<typeof startServer>>;
  let redirector: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    seen = [];
    target = await startServer((req, res) => {
      seen.push({ host: String(req.headers.host), headers: req.headers });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ version: '1.0.0', MediaContainer: { Directory: [] } }));
    });
    const targetUrl = target.url.replace('127.0.0.1', 'localhost');
    redirector = await startServer((req, res) => {
      res.statusCode = 302;
      res.setHeader('location', `${targetUrl}${req.url}`);
      res.end();
    });
  });

  afterEach(async () => {
    await redirector.close();
    await target.close();
  });

  it('never sends X-Api-Key to an Overseerr redirect target', async () => {
    const result = await new OverseerrService(redirector.url, 'overseerr-secret-key').testConnection();

    expect(seen.filter((r) => r.headers['x-api-key'])).toEqual([]);
    expect(result.success).toBe(false);
  });

  it('never sends X-Plex-Token to a Plex server redirect target', async () => {
    const service = new PlexService('plex-secret-token', redirector.url);

    const sections = service.getLibrarySections().catch((error: unknown) => error);

    await sections;
    expect(seen.filter((r) => r.headers['x-plex-token'])).toEqual([]);
    expect(await sections).toBeInstanceOf(Error);
  });
});
