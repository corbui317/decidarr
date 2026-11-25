import http from 'http';
import https from 'https';
import { lookup as dnsLookup } from 'dns/promises';
import type { LookupFunction } from 'net';
import { isIP } from 'net';
import { Readable } from 'stream';
import { assertTestOnly } from '@/lib/test-only';
import { isAddressAllowed, normalizeIp, serviceUrlPolicy, type UrlPolicy } from './url-policy';

export type IntegrationName = 'Plex' | 'plex.tv' | 'Tautulli' | 'Overseerr' | 'TMDb';

export type IntegrationErrorReason =
  | 'invalid_url'
  | 'unresolvable'
  | 'blocked_address'
  | 'redirect'
  | 'timeout'
  | 'network'
  | 'http_status'
  | 'bad_response';

const UNAVAILABLE_REASONS: IntegrationErrorReason[] = ['unresolvable', 'timeout', 'network'];

/** The one error every integration reports, whatever went wrong. */
export class IntegrationError extends Error {
  override readonly name = 'IntegrationError';

  constructor(
    readonly integration: IntegrationName,
    readonly reason: IntegrationErrorReason,
    message: string,
    readonly status?: number
  ) {
    super(`${integration}: ${message}`);
  }

  /** The integration could not be reached or failed on its side, rather than refusing the request. */
  get unavailable(): boolean {
    return (
      UNAVAILABLE_REASONS.includes(this.reason) ||
      (this.reason === 'http_status' && (this.status ?? 0) >= 500)
    );
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Resolves a hostname to every address it currently answers with. */
export type IntegrationLookup = (hostname: string) => Promise<ResolvedAddress[]>;

/** One outbound request, already checked against the URL policy and pinned to `address`. */
export interface TransportRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: string;
  signal: AbortSignal;
  address: ResolvedAddress;
}

/** Sends one request and never follows a redirect. Tests inject a fake one. */
export type IntegrationFetch = (request: TransportRequest) => Promise<Response>;

export type AuthStrategy = { header: string; value: string } | { query: string; value: string };

export interface IntegrationClientOptions {
  integration: IntegrationName;
  baseUrl: string;
  auth?: AuthStrategy;
  /** Sent with every request; per-request headers override them. */
  headers?: Record<string, string>;
  timeoutMs: number;
  /** Defaults to the Admin's configured policy. */
  urlPolicy?: UrlPolicy;
  fetch?: IntegrationFetch;
  lookup?: IntegrationLookup;
}

export interface IntegrationRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  query?: Record<string, string | number>;
}

export interface IntegrationClient {
  /** Any final response that is not a redirect; the caller reads the status. */
  request(path: string, options?: IntegrationRequestOptions): Promise<Response>;
  /** The parsed body of a 2xx response; any other status is an IntegrationError. */
  json<T = unknown>(path: string, options?: IntegrationRequestOptions): Promise<T>;
}

const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Node transport: connects to the pinned address, keeping the hostname for Host, SNI and the certificate check.
 * A kept-alive socket the default agent reuses was itself opened to an address that passed the same policy.
 */
export const nodeTransport: IntegrationFetch = ({ url, method, headers, body, signal, address }) =>
  new Promise((resolve, reject) => {
    const pinnedLookup = ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) =>
      options.all
        ? callback(null, [address])
        : callback(null, address.address, address.family)) as unknown as LookupFunction;

    const outgoing = Object.fromEntries(headers);
    if (body !== undefined) outgoing['content-length'] = String(Buffer.byteLength(body));

    const req = (url.protocol === 'https:' ? https : http).request(
      url,
      { method, headers: outgoing, signal, lookup: pinnedLookup },
      (res) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
            responseHeaders.append(name, item);
          }
        }
        const status = res.statusCode ?? 502;
        const hasBody = method !== 'HEAD' && !NULL_BODY_STATUSES.has(status);
        if (!hasBody) res.resume();
        resolve(
          new Response(hasBody ? (Readable.toWeb(res) as ReadableStream<Uint8Array>) : null, {
            status,
            statusText: res.statusMessage,
            headers: responseHeaders,
          })
        );
      }
    );
    req.on('error', reject);
    req.end(body);
  });

const dnsResolve: IntegrationLookup = async (hostname) => {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
};

let testTransport: { fetch?: IntegrationFetch; lookup?: IntegrationLookup } | null = null;

/** Lets tests fake every integration and DNS answer for code they cannot pass options to. */
export function setIntegrationTransportForTests(
  transport: { fetch?: IntegrationFetch; lookup?: IntegrationLookup } | null
): void {
  assertTestOnly('setIntegrationTransportForTests');
  testTransport = transport;
}

/** Resolves a hostname the way integrations do, so a save-time check sees the same answers. */
export function resolveHost(hostname: string, lookup?: IntegrationLookup): Promise<ResolvedAddress[]> {
  return (lookup ?? testTransport?.lookup ?? dnsResolve)(hostname);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export function createIntegrationClient(options: IntegrationClientOptions): IntegrationClient {
  const { integration, timeoutMs } = options;
  const fail = (reason: IntegrationErrorReason, message: string, status?: number) =>
    new IntegrationError(integration, reason, message, status);

  function buildUrl(path: string, query?: IntegrationRequestOptions['query']): URL {
    let url: URL;
    try {
      url = new URL(`${options.baseUrl.replace(/\/+$/, '')}${path}`);
    } catch {
      throw fail('invalid_url', 'invalid URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw fail('invalid_url', 'only http and https URLs without credentials are allowed');
    }
    for (const [name, value] of Object.entries(query ?? {})) {
      url.searchParams.set(name, String(value));
    }
    if (options.auth && 'query' in options.auth) {
      url.searchParams.set(options.auth.query, options.auth.value);
    }
    return url;
  }

  /** Checks every address the host resolves to now, and returns the one to connect to. */
  async function checkedAddress(url: URL): Promise<ResolvedAddress> {
    const literal = normalizeIp(url.hostname);
    let addresses: ResolvedAddress[];
    if (literal) {
      addresses = [{ address: literal, family: isIP(literal) === 6 ? 6 : 4 }];
    } else {
      try {
        addresses = await resolveHost(url.hostname, options.lookup);
      } catch {
        throw fail('unresolvable', 'could not resolve host');
      }
    }
    if (addresses.length === 0) throw fail('unresolvable', 'could not resolve host');

    const policy = options.urlPolicy ?? serviceUrlPolicy();
    if (addresses.some(({ address }) => !isAddressAllowed(address, policy))) {
      throw fail('blocked_address', 'host resolves to a disallowed address');
    }
    return addresses[0];
  }

  async function request(path: string, init: IntegrationRequestOptions = {}): Promise<Response> {
    const url = buildUrl(path, init.query);
    const address = await checkedAddress(url);

    const headers = new Headers({ ...options.headers, ...init.headers });
    if (options.auth && 'header' in options.auth) {
      headers.set(options.auth.header, options.auth.value);
    }

    const signal = AbortSignal.timeout(timeoutMs);
    const send = options.fetch ?? testTransport?.fetch ?? nodeTransport;
    let response: Response;
    try {
      response = await send({ url, method: init.method ?? 'GET', headers, body: init.body, signal, address });
    } catch (error) {
      throw signal.aborted || isAbort(error)
        ? fail('timeout', `no response within ${timeoutMs} ms`)
        : fail('network', 'request failed');
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw fail('redirect', `refused to follow a redirect (HTTP ${response.status})`, response.status);
    }
    return response;
  }

  async function json<T>(path: string, init?: IntegrationRequestOptions): Promise<T> {
    const response = await request(path, init);
    if (!response.ok) {
      await response.body?.cancel();
      throw fail('http_status', `HTTP ${response.status}`, response.status);
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw isAbort(error) ? fail('timeout', `no response within ${timeoutMs} ms`) : fail('bad_response', 'invalid JSON');
    }
  }

  return { request, json };
}
