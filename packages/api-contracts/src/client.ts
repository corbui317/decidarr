import type { SelectionParameters, SelectionResultResponse } from './selection';
import type { PoolCountResult } from './filters';
import type { PreferenceContract } from './sync';
import type {
  SyncBootstrapResponse,
  SyncChangesResponse,
  SyncMutation,
  SyncMutationBatchResponse,
} from './sync';
import type {
  MobileAuthExchangeRequest,
  MobileAuthExchangeResponse,
  MobileAuthLogoutRequest,
  MobileAuthRefreshRequest,
  MobileAuthRefreshResponse,
  MobileAuthStartRequest,
  MobileAuthStartResponse,
} from './mobile-auth';
import type { SpinHistoryCreateBody } from './spin-history';

/** The one error shape both the web and mobile clients throw on a non-2xx response. */
export class ApiError extends Error {
  public status: number;
  public code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** What `createApiClient` needs: something that can make one authenticated request and parse its JSON. */
export interface Transport {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

function buildQuery(query?: Record<string, string | number | undefined>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = data as { error?: string; message?: string; code?: string };
    throw new ApiError(body.error || body.message || 'Request failed', response.status, body.code);
  }
  return data as T;
}

function resolveBaseUrl(baseUrl: string | (() => string)): string {
  return typeof baseUrl === 'function' ? baseUrl() : baseUrl;
}

export interface WebTransportOptions {
  baseUrl: string | (() => string);
  /** Headers merged onto every request, e.g. a setup secret; per-call `options.headers` wins. */
  getHeaders?: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}

/** Cookie-authenticated transport for the web app: sends `credentials: 'include'`. */
export function createWebTransport(opts: WebTransportOptions): Transport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(opts.getHeaders?.() ?? {}),
        ...(options.headers ?? {}),
      };
      const response = await fetchImpl(`${resolveBaseUrl(opts.baseUrl)}${path}${buildQuery(options.query)}`, {
        method: options.method ?? 'GET',
        headers,
        credentials: 'include',
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
      return parseResponse<T>(response);
    },
  };
}

export interface PublicTransportOptions {
  baseUrl: string | (() => string);
  fetchImpl?: typeof fetch;
}

/** Unauthenticated transport, for requests made before a session exists (mobile sign-in, token refresh). */
export function createPublicTransport(opts: PublicTransportOptions): Transport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      };
      const response = await fetchImpl(`${resolveBaseUrl(opts.baseUrl)}${path}${buildQuery(options.query)}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
      return parseResponse<T>(response);
    },
  };
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MobileTransportOptions {
  baseUrl: string | (() => string);
  getAccessToken: () => Promise<string | null>;
  /** Epoch milliseconds the current access token expires at, or null if unknown/absent. */
  getExpiresAt: () => Promise<number | null>;
  /** Calls the refresh endpoint and persists the result; returns null when refresh itself fails. */
  refresh: () => Promise<RefreshedTokens | null>;
  fetchImpl?: typeof fetch;
}

export interface MobileTransport extends Transport {
  /** The current access token, refreshed first if it is missing or close to expiry. Null only when refresh failed. */
  getValidAccessToken(): Promise<string | null>;
}

/** Refresh this long before expiry so a request started just before the deadline still gets a fresh token. */
const REFRESH_SKEW_MS = 60_000;

/**
 * Bearer-token transport for the mobile app. Refreshes proactively before the access token
 * expires, and reactively (once) on a 401; the caller is told to sign out only when the
 * refresh call itself fails, never merely because a request came back unauthorized.
 */
export function createMobileTransport(opts: MobileTransportOptions): MobileTransport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let refreshing: Promise<string | null> | null = null;

  function refreshOnce(): Promise<string | null> {
    if (!refreshing) {
      refreshing = opts
        .refresh()
        .then((result) => result?.accessToken ?? null)
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  async function getValidAccessToken(): Promise<string | null> {
    const [token, expiresAt] = await Promise.all([opts.getAccessToken(), opts.getExpiresAt()]);
    const expiringSoon = expiresAt !== null && expiresAt - Date.now() < REFRESH_SKEW_MS;
    if (token && !expiringSoon) return token;
    return refreshOnce();
  }

  async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchImpl(`${resolveBaseUrl(opts.baseUrl)}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  }

  return {
    getValidAccessToken,
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      const token = await getValidAccessToken();
      let response = await send(path, options, token);
      if (response.status === 401) {
        const refreshed = await refreshOnce();
        if (refreshed) {
          response = await send(path, options, refreshed);
        }
      }
      return parseResponse<T>(response);
    },
  };
}

/**
 * The request/response shapes both web and mobile share, built once from the contract
 * schemas and dispatched through whichever transport the caller is authenticated with.
 */
export function createApiClient(transport: Transport) {
  return {
    mobileAuth: {
      start: (body: MobileAuthStartRequest) =>
        transport.request<MobileAuthStartResponse>('/mobile/auth/start', { method: 'POST', body }),
      exchange: (body: MobileAuthExchangeRequest) =>
        transport.request<MobileAuthExchangeResponse>('/mobile/auth/exchange', { method: 'POST', body }),
      refresh: (body: MobileAuthRefreshRequest) =>
        transport.request<MobileAuthRefreshResponse>('/mobile/auth/refresh', { method: 'POST', body }),
      logout: (body: MobileAuthLogoutRequest = {}) =>
        transport.request<{ success: boolean }>('/mobile/auth/logout', { method: 'POST', body }),
    },
    sync: {
      bootstrap: () => transport.request<SyncBootstrapResponse>('/v1/sync/bootstrap'),
      changes: (cursor: string, limit = 100) =>
        transport.request<SyncChangesResponse>('/v1/sync/changes', { query: { cursor, limit } }),
      mutations: (mutations: SyncMutation[]) =>
        transport.request<SyncMutationBatchResponse>('/v1/sync/mutations', {
          method: 'POST',
          body: { mutations },
        }),
    },
    selection: {
      random: (params: SelectionParameters) =>
        transport.request<SelectionResultResponse>('/selection/random', { method: 'POST', body: params }),
      poolCount: (params: Omit<SelectionParameters, 'tvSelectionMode'>, signal?: AbortSignal) =>
        transport.request<PoolCountResult>('/selection/pool-count', { method: 'POST', body: params, signal }),
    },
    spinHistory: {
      create: (payload: SpinHistoryCreateBody) =>
        transport.request<{ entry?: unknown; skipped?: boolean; reason?: string }>('/spin-history', {
          method: 'POST',
          body: payload,
        }),
    },
    preferences: {
      update: (preferences: Partial<PreferenceContract>) =>
        transport.request<{ success: boolean; preferences: PreferenceContract }>('/users/me/preferences', {
          method: 'PUT',
          body: preferences,
        }),
    },
    library: {
      getSections: () =>
        transport.request<{ sections: Array<{ id: string; title: string; type: string }> }>(
          '/library/sections'
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
