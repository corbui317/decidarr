#!/usr/bin/env node
/**
 * Read-only production PWA origin probe for Decidarr.
 *
 * Usage: node scripts/verify-pwa-origin.mjs https://decidarr.example.com
 */

const REQUIRED_MANIFEST_FIELDS = ['name', 'short_name', 'start_url', 'display'];
const REQUIRED_ICON_SIZES = ['192x192', '512x512'];
const ALLOWED_DISPLAY_MODES = new Set(['standalone', 'fullscreen', 'minimal-ui']);

/**
 * @param {string} input
 * @returns {URL}
 */
export function parseTargetUrl(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('A target URL is required.');
  }

  let parsed;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  const isLocalhost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '[::1]';

  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error(
      `Target must use HTTPS. Received ${parsed.protocol}//${parsed.host}. ` +
        'Only localhost may be probed over HTTP for development.'
    );
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  return parsed;
}

/**
 * @param {string} hostname
 * @returns {string}
 */
export function registrableHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  const parts = normalized.split('.');
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join('.');
}

/**
 * @param {string} fromHost
 * @param {string} toHost
 */
export function isSameRegistrableDomain(fromHost, toHost) {
  const from = fromHost.toLowerCase();
  const to = toHost.toLowerCase();
  if (from === to) return true;

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (localHosts.has(from) || localHosts.has(to)) {
    return from === to;
  }

  return registrableHost(from) === registrableHost(to);
}

/**
 * @param {Response} response
 */
export function isRedirectStatus(response) {
  return response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308;
}

/**
 * @param {string} url
 * @param {string} allowedHost
 * @param {typeof fetch} fetchImpl
 * @param {RequestInit} init
 */
export async function fetchWithOriginGuard(url, allowedHost, fetchImpl = fetch, init = {}) {
  const response = await fetchImpl(url, { ...init, redirect: 'manual' });

  if (!isRedirectStatus(response)) {
    return response;
  }

  const location = response.headers.get('location');
  if (!location) {
    throw new Error(`Redirect response from ${url} is missing a Location header.`);
  }

  const nextUrl = new URL(location, url);
  if (!isSameRegistrableDomain(allowedHost, nextUrl.hostname)) {
    throw new Error(
      `Redirect from ${url} crosses registrable domains (${allowedHost} -> ${nextUrl.hostname}).`
    );
  }

  return fetchWithOriginGuard(nextUrl.toString(), allowedHost, fetchImpl, init);
}

/**
 * @param {unknown} manifest
 * @param {string} origin
 */
export function validateManifest(manifest, origin) {
  const failures = [];

  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest is not a JSON object.'];
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field] || typeof manifest[field] !== 'string') {
      failures.push(`Manifest is missing required field "${field}".`);
    }
  }

  if (manifest.display && !ALLOWED_DISPLAY_MODES.has(manifest.display)) {
    failures.push(`Manifest display "${manifest.display}" is not a supported install mode.`);
  }

  if (manifest.start_url) {
    const start = new URL(manifest.start_url, origin);
    if (start.origin !== origin) {
      failures.push(`Manifest start_url "${manifest.start_url}" is outside the canonical origin.`);
    }
  }

  if (manifest.scope) {
    const scope = new URL(manifest.scope, origin);
    if (scope.origin !== origin) {
      failures.push(`Manifest scope "${manifest.scope}" is outside the canonical origin.`);
    }
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  if (icons.length === 0) {
    failures.push('Manifest declares no icons.');
  }

  const iconSizes = icons.map((icon) => icon?.sizes).filter(Boolean);
  for (const size of REQUIRED_ICON_SIZES) {
    if (!iconSizes.includes(size)) {
      failures.push(`Manifest is missing a ${size} icon.`);
    }
  }

  for (const icon of icons) {
    if (!icon?.src || !icon?.sizes || !icon?.type) {
      failures.push('Manifest icon entries must include src, sizes, and type.');
      break;
    }
  }

  return failures;
}

/**
 * @param {string} html
 * @param {string} origin
 */
export function validateRootDocument(html, origin) {
  const failures = [];
  const lower = html.toLowerCase();

  if (!lower.includes('rel="manifest"') && !lower.includes("rel='manifest'")) {
    failures.push('Root document does not link a web app manifest.');
  }

  const manifestHrefMatch =
    html.match(/<link[^>]+rel=["']manifest["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']manifest["']/i);

  if (manifestHrefMatch) {
    const href = manifestHrefMatch[1];
    const manifestUrl = new URL(href, origin);
    if (manifestUrl.origin !== origin) {
      failures.push(`Manifest link href "${href}" is outside the canonical origin.`);
    }
  }

  const hasThemeColorMeta =
    /<meta[^>]+name=["']theme-color["'][^>]+content=["'][^"']+["']/i.test(html) ||
    /<meta[^>]+content=["'][^"']+["'][^>]+name=["']theme-color["']/i.test(html);

  if (!hasThemeColorMeta) {
    failures.push('Root document does not advertise a theme-color meta tag.');
  }

  return failures;
}

/**
 * @param {string} body
 * @param {string | null} contentType
 */
export function validateServiceWorker(body, contentType) {
  const failures = [];
  const normalizedType = (contentType || '').toLowerCase();

  if (!normalizedType.includes('javascript') && !normalizedType.includes('ecmascript')) {
    failures.push(`Service worker content-type is "${contentType || 'missing'}", expected JavaScript.`);
  }

  const trimmed = body.trimStart().toLowerCase();
  if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
    failures.push('Service worker response looks like HTML instead of JavaScript.');
  }

  if (!body.includes('addEventListener')) {
    failures.push('Service worker payload does not look like an active worker script.');
  }

  return failures;
}

/**
 * @param {string | null} contentType
 * @param {string} expectedType
 */
export function validateIconContentType(contentType, expectedType) {
  const failures = [];
  const actual = (contentType || '').toLowerCase();
  const expected = expectedType.toLowerCase();

  if (!actual) {
    failures.push(`Icon response is missing a content-type (expected ${expectedType}).`);
    return failures;
  }

  if (actual.split(';')[0].trim() !== expected) {
    failures.push(`Icon content-type is "${contentType}", expected ${expectedType}.`);
  }

  return failures;
}

/**
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
export async function checkHttpToHttpsRedirect(httpsUrl, fetchImpl = fetch) {
  const parsed = new URL(httpsUrl);
  if (parsed.protocol !== 'https:') {
    return ['HTTP-to-HTTPS redirect check applies only to HTTPS targets.'];
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (localHosts.has(parsed.hostname)) {
    return [];
  }

  const httpUrl = new URL(parsed.toString());
  httpUrl.protocol = 'http:';

  const response = await fetchImpl(httpUrl.toString(), { redirect: 'manual' });
  if (!isRedirectStatus(response)) {
    return [`HTTP ${httpUrl.origin} did not redirect (${response.status}). Expected 301 or 308.`];
  }

  const location = response.headers.get('location');
  if (!location) {
    return [`HTTP ${httpUrl.origin} redirect is missing a Location header.`];
  }

  const target = new URL(location, httpUrl);
  if (target.protocol !== 'https:') {
    return [`HTTP ${httpUrl.origin} redirects to non-HTTPS target ${target.protocol}//${target.host}.`];
  }

  if (!isSameRegistrableDomain(parsed.hostname, target.hostname)) {
    return [
      `HTTP redirect target crosses registrable domains (${parsed.hostname} -> ${target.hostname}).`,
    ];
  }

  return [];
}

/**
 * @typedef {{ name: string, ok: boolean, detail?: string }} CheckResult
 */

/**
 * @param {string} targetUrl
 * @param {{ fetchImpl?: typeof fetch, skipHttpRedirect?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, origin: string, checks: CheckResult[] }>}
 */
export async function verifyOrigin(targetUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const parsed = parseTargetUrl(targetUrl);
  const origin = parsed.origin;
  const checks = [];

  const addCheck = (name, failures) => {
    checks.push({
      name,
      ok: failures.length === 0,
      detail: failures.length > 0 ? failures.join(' ') : undefined,
    });
  };

  if (!options.skipHttpRedirect) {
    addCheck('http-to-https-redirect', await checkHttpToHttpsRedirect(parsed.toString(), fetchImpl));
  }

  let rootResponse;
  try {
    rootResponse = await fetchWithOriginGuard(origin + '/', parsed.hostname, fetchImpl);
  } catch (error) {
    addCheck('root-document', [error instanceof Error ? error.message : String(error)]);
    return { ok: false, origin, checks };
  }

  if (!rootResponse.ok) {
    addCheck('root-document', [`GET / returned ${rootResponse.status}.`]);
    return { ok: false, origin, checks };
  }

  const rootHtml = await rootResponse.text();
  addCheck('root-document', validateRootDocument(rootHtml, origin));

  let manifest;
  let manifestResponse;
  try {
    manifestResponse = await fetchWithOriginGuard(`${origin}/manifest.webmanifest`, parsed.hostname, fetchImpl);
  } catch (error) {
    addCheck('manifest', [error instanceof Error ? error.message : String(error)]);
    return { ok: false, origin, checks };
  }

  if (!manifestResponse.ok) {
    addCheck('manifest', [`GET /manifest.webmanifest returned ${manifestResponse.status}.`]);
    return { ok: false, origin, checks };
  }

  try {
    manifest = await manifestResponse.json();
  } catch {
    addCheck('manifest', ['Manifest response is not valid JSON.']);
    return { ok: false, origin, checks };
  }

  addCheck('manifest', validateManifest(manifest, origin));

  let swResponse;
  try {
    swResponse = await fetchWithOriginGuard(`${origin}/sw.js`, parsed.hostname, fetchImpl);
  } catch (error) {
    addCheck('service-worker', [error instanceof Error ? error.message : String(error)]);
    return { ok: false, origin, checks };
  }

  if (!swResponse.ok) {
    addCheck('service-worker', [`GET /sw.js returned ${swResponse.status}.`]);
  } else {
    const swBody = await swResponse.text();
    addCheck(
      'service-worker',
      validateServiceWorker(swBody, swResponse.headers.get('content-type'))
    );
  }

  const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
  for (const icon of icons) {
    const iconUrl = new URL(icon.src, origin).toString();
    const label = `icon:${icon.sizes || icon.src}`;

    try {
      const iconResponse = await fetchWithOriginGuard(iconUrl, parsed.hostname, fetchImpl);
      if (!iconResponse.ok) {
        addCheck(label, [`GET ${icon.src} returned ${iconResponse.status}.`]);
        continue;
      }

      const iconFailures = validateIconContentType(
        iconResponse.headers.get('content-type'),
        icon.type
      );
      addCheck(label, iconFailures);
    } catch (error) {
      addCheck(label, [error instanceof Error ? error.message : String(error)]);
    }
  }

  const ok = checks.every((check) => check.ok);
  return { ok, origin, checks };
}

/**
 * @param {{ ok: boolean, origin: string, checks: CheckResult[] }} report
 */
export function formatReport(report) {
  const lines = [`Decidarr PWA origin verification: ${report.origin}`];
  for (const check of report.checks) {
    lines.push(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  lines.push(report.ok ? 'Result: PASS' : 'Result: FAIL');
  return lines.join('\n');
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/verify-pwa-origin.mjs <https-origin>');
    process.exit(2);
  }

  try {
    const report = await verifyOrigin(target);
    console.log(formatReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
