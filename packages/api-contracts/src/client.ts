import type { SelectionParameters, SelectionResultResponse, AwardCategoriesResponse } from './selection';
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
import type {
  SpinHistoryCreateBody,
  SpinHistoryCreateResponse,
  SpinHistoryListResponse,
  SpinHistoryDeleteResponse,
  SpinHistoryClearAllResponse,
} from './spin-history';
import type {
  PreferencesGetResponse,
  PreferencesPutResponse,
  PreferencesPatchBody,
  PreferencesPatchResponse,
} from './preferences';
import type { AdminUsersListResponse, AdminUserApprovalResponse } from './admin';
import type {
  LibrarySectionsResponse,
  LibraryItemsResponse,
  LibraryGenresResponse,
  LibraryYearsResponse,
  LibraryStudiosResponse,
  LibraryFilterOptionsResponse,
  LibraryCollectionsResponse,
} from './library';
import type { WatchedListResponse, WatchedStatusResponse, WatchedCreateBody } from './watched';
import type {
  SettingsResponse,
  SettingsUpdateResponse,
  SettingsUpdateBody,
  SettingsStatusResponse,
  SettingsSetupResponse,
  SettingsSetupBody,
  PlexTestResponse,
  TmdbTestResponse,
} from './settings';
import type { TautulliTestResponse, TautulliSyncResponse } from './tautulli';
import type { OverseerrTestResponse, OverseerrStatusResponse } from './overseerr';
import type {
  AuthMeResponse,
  PlexLoginStartResponse,
  PlexLoginPollResponse,
  RefreshSessionResponse,
} from './auth';

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
    auth: {
      getCurrentUser: () => transport.request<AuthMeResponse>('/auth/me'),
      startPlexLogin: (headers?: Record<string, string>) =>
        transport.request<PlexLoginStartResponse>('/auth/plex/start', { method: 'POST', headers }),
      pollPlexLogin: (state: string) =>
        transport.request<PlexLoginPollResponse>('/auth/plex/poll', { query: { state } }),
      refreshSession: () => transport.request<RefreshSessionResponse>('/auth/refresh', { method: 'POST' }),
      logout: () => transport.request<{ message: string }>('/auth/logout', { method: 'DELETE' }),
    },
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
      getAwardCategories: () =>
        transport.request<AwardCategoriesResponse>('/selection/awards/categories'),
    },
    spinHistory: {
      list: (page = 1, limit = 20) =>
        transport.request<SpinHistoryListResponse>('/spin-history', { query: { page, limit } }),
      create: (payload: SpinHistoryCreateBody) =>
        transport.request<SpinHistoryCreateResponse>('/spin-history', {
          method: 'POST',
          body: payload,
        }),
      delete: (id: string) =>
        transport.request<SpinHistoryDeleteResponse>(`/spin-history/${id}`, { method: 'DELETE' }),
      clearAll: () =>
        transport.request<SpinHistoryClearAllResponse>('/spin-history', { method: 'DELETE' }),
    },
    preferences: {
      get: () => transport.request<PreferencesGetResponse>('/users/me/preferences'),
      update: (preferences: Partial<PreferenceContract>) =>
        transport.request<PreferencesPutResponse>('/users/me/preferences', {
          method: 'PUT',
          body: preferences,
        }),
      updateSpinHistory: (spinHistory: PreferencesPatchBody['spinHistory']) =>
        transport.request<PreferencesPatchResponse>('/users/me/preferences', {
          method: 'PATCH',
          body: { spinHistory },
        }),
    },
    admin: {
      listUsers: () => transport.request<AdminUsersListResponse>('/admin/users'),
      setApproved: (plexUserId: string, approved: boolean) =>
        transport.request<AdminUserApprovalResponse>(`/admin/users/${encodeURIComponent(plexUserId)}`, {
          method: 'PUT',
          body: { approved },
        }),
    },
    library: {
      getSections: () => transport.request<LibrarySectionsResponse>('/library/sections'),
      getItems: (id: string, forceRefresh = false) =>
        transport.request<LibraryItemsResponse>(`/library/${id}/items?forceRefresh=${forceRefresh}`),
      getGenres: (libraryIds: string[]) =>
        transport.request<LibraryGenresResponse>(`/library/genres?libraryIds=${libraryIds.join(',')}`),
      getYears: (libraryIds: string[]) =>
        transport.request<LibraryYearsResponse>(`/library/years?libraryIds=${libraryIds.join(',')}`),
      getStudios: () => transport.request<LibraryStudiosResponse>('/library/studios'),
      getFilterOptions: (libraryIds: string[]) =>
        transport.request<LibraryFilterOptionsResponse>(
          `/library/filter-options?libraryIds=${libraryIds.join(',')}`
        ),
      getCollections: (libraryIds: string[]) =>
        transport.request<LibraryCollectionsResponse>(
          `/library/collections?libraryIds=${libraryIds.join(',')}`
        ),
    },
    watched: {
      getAll: (mediaType?: string, page = 1, limit = 50) =>
        transport.request<WatchedListResponse>(
          `/watched?mediaType=${mediaType || ''}&page=${page}&limit=${limit}`
        ),
      getStatus: (plexId: string) =>
        transport.request<WatchedStatusResponse>(`/watched/${encodeURIComponent(plexId)}`),
      markWatched: (plexId: string, body: WatchedCreateBody) =>
        transport.request<unknown>(`/watched/${plexId}`, { method: 'POST', body }),
      markUnwatched: (plexId: string) =>
        transport.request<unknown>(`/watched/${plexId}`, { method: 'DELETE' }),
    },
    settings: {
      getSettings: () => transport.request<SettingsResponse>('/settings'),
      getStatus: () => transport.request<SettingsStatusResponse>('/settings/status'),
      updateSettings: (body: SettingsUpdateBody) =>
        transport.request<SettingsUpdateResponse>('/settings', { method: 'PUT', body }),
      setup: (body: SettingsSetupBody) =>
        transport.request<SettingsSetupResponse>('/settings/setup', { method: 'POST', body }),
      /** Tests a Plex server URL with the Admin's own access token for this install's server. */
      testPlex: (plexServerUrl: string) =>
        transport.request<PlexTestResponse>('/settings/test-plex', { method: 'POST', body: { plexServerUrl } }),
      testTmdb: (apiKey: string) =>
        transport.request<TmdbTestResponse>('/settings/test-tmdb', { method: 'POST', body: { apiKey } }),
    },
    tautulli: {
      test: (url: string, apiKey: string) =>
        transport.request<TautulliTestResponse>('/tautulli/test', { method: 'POST', body: { url, apiKey } }),
      sync: () => transport.request<TautulliSyncResponse>('/tautulli/sync', { method: 'POST' }),
    },
    overseerr: {
      test: (url: string, apiKey: string) =>
        transport.request<OverseerrTestResponse>('/overseerr/test', { method: 'POST', body: { url, apiKey } }),
      getStatus: () => transport.request<OverseerrStatusResponse>('/overseerr/status'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
