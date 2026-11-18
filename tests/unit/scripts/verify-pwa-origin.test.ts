import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  parseTargetUrl,
  validateManifest,
  validateRootDocument,
  validateServiceWorker,
  validateIconContentType,
  checkHttpToHttpsRedirect,
  verifyOrigin,
  formatReport,
  isSameRegistrableDomain,
} from '../../../scripts/verify-pwa-origin.mjs';

const manifest = {
  name: 'Decidarr - Plex Movie Roulette',
  short_name: 'Decidarr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  icons: [
    { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
    { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
  ],
};

const rootHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta name="theme-color" content="#E5A00D" />
    <link rel="manifest" href="/manifest.webmanifest" />
  </head>
  <body>Decidarr</body>
</html>`;

const serviceWorker = `self.addEventListener('install', () => {});`;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/manifest+json' });
  res.end(JSON.stringify(body));
}

function createFixtureHandler(options: {
  manifestBody?: unknown;
  rootBody?: string;
  serviceWorkerBody?: string;
  iconType?: string;
  redirectHttpToHttps?: boolean;
}) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (options.redirectHttpToHttps && req.headers.host?.includes(':80')) {
      res.writeHead(308, { Location: `https://${req.headers.host}${url.pathname}` });
      res.end();
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(options.rootBody ?? rootHtml);
      return;
    }

    if (url.pathname === '/manifest.webmanifest') {
      sendJson(res, 200, options.manifestBody ?? manifest);
      return;
    }

    if (url.pathname === '/sw.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(options.serviceWorkerBody ?? serviceWorker);
      return;
    }

    if (url.pathname.startsWith('/icons/')) {
      res.writeHead(200, { 'Content-Type': options.iconType ?? 'image/svg+xml' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      return;
    }

    res.writeHead(404);
    res.end('not found');
  };
}

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

describe('verify-pwa-origin helpers', () => {
  it('rejects non-HTTPS targets except localhost', () => {
    expect(() => parseTargetUrl('http://decidarr.example.com')).toThrow(/HTTPS/);
    expect(parseTargetUrl('http://localhost:3100').hostname).toBe('localhost');
    expect(parseTargetUrl('https://decidarr.example.com').protocol).toBe('https:');
  });

  it('validates manifest metadata and icon sizes', () => {
    expect(validateManifest(manifest, 'https://decidarr.example.com')).toEqual([]);
    expect(validateManifest({ ...manifest, short_name: '' }, 'https://decidarr.example.com')).toContain(
      'Manifest is missing required field "short_name".'
    );
    expect(
      validateManifest({ ...manifest, icons: manifest.icons.filter((icon) => icon.sizes !== '192x192') }, 'https://decidarr.example.com')
    ).toContain('Manifest is missing a 192x192 icon.');
  });

  it('validates root document manifest link and theme color', () => {
    expect(validateRootDocument(rootHtml, 'https://decidarr.example.com')).toEqual([]);
    expect(validateRootDocument('<html></html>', 'https://decidarr.example.com')).toContain(
      'Root document does not link a web app manifest.'
    );
    expect(validateRootDocument('<html><link rel="manifest" href="/manifest.webmanifest"></html>', 'https://decidarr.example.com')).toContain(
      'Root document does not advertise a theme-color meta tag.'
    );
  });

  it('rejects HTML service worker responses', () => {
    expect(validateServiceWorker(serviceWorker, 'application/javascript')).toEqual([]);
    expect(validateServiceWorker('<!DOCTYPE html><html></html>', 'text/html')).toContain(
      'Service worker response looks like HTML instead of JavaScript.'
    );
  });

  it('validates icon content types', () => {
    expect(validateIconContentType('image/svg+xml', 'image/svg+xml')).toEqual([]);
    expect(validateIconContentType('text/plain', 'image/svg+xml')[0]).toMatch(/content-type/i);
  });

  it('detects cross-registrable-domain redirects', () => {
    expect(isSameRegistrableDomain('decidarr.example.com', 'decidarr.example.com')).toBe(true);
    expect(isSameRegistrableDomain('decidarr.example.com', 'evil.example.org')).toBe(false);
  });
});

describe('verify-pwa-origin integration', () => {
  let fixture: Awaited<ReturnType<typeof startServer>>;

  beforeAll(async () => {
    fixture = await startServer(createFixtureHandler({}));
  });

  afterAll(async () => {
    await fixture.close();
  });

  it('passes against a valid local fixture origin', async () => {
    const report = await verifyOrigin(fixture.origin, { skipHttpRedirect: true });
    expect(report.ok).toBe(true);
    expect(formatReport(report)).toContain('Result: PASS');
  });

  it('fails when the service worker returns HTML', async () => {
    const badFixture = await startServer(
      createFixtureHandler({ serviceWorkerBody: '<!DOCTYPE html><html></html>' })
    );

    const report = await verifyOrigin(badFixture.origin, { skipHttpRedirect: true });
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'service-worker')?.detail).toMatch(/HTML/);

    await badFixture.close();
  });

  it('fails when manifest icons are missing required sizes', async () => {
    const badFixture = await startServer(
      createFixtureHandler({
        manifestBody: {
          ...manifest,
          icons: [{ src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }],
        },
      })
    );

    const report = await verifyOrigin(badFixture.origin, { skipHttpRedirect: true });
    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.name === 'manifest')?.detail).toMatch(/192x192/);

    await badFixture.close();
  });
});

describe('verify-pwa-origin redirect checks', () => {
  it('accepts HTTP to HTTPS redirects on the same host', async () => {
    const failures = await checkHttpToHttpsRedirect('https://decidarr.example.com', async () =>
      ({
        status: 308,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'location' ? 'https://decidarr.example.com/' : null),
        },
      }) as unknown as Response
    );

    expect(failures).toEqual([]);
  });

  it('rejects HTTP origins that do not redirect', async () => {
    const failures = await checkHttpToHttpsRedirect('https://decidarr.example.com', async () =>
      ({
        status: 200,
        headers: { get: () => null },
      }) as unknown as Response
    );

    expect(failures[0]).toMatch(/did not redirect/i);
  });
});
