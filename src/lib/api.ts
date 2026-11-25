'use client';

import type { LoginErrorCode } from './auth-errors';
import type {
  Filters,
  SelectionResultResponse,
  MediaType,
  MediaTypeWithEpisode,
  TvSelectionMode,
  AppTheme,
  AnimationStyle,
  AnimationSpeed,
  SelectionParameters,
} from '@decidarr/api-contracts';
import type { WatchedMediaType } from '@/lib/validation/watched';

// Re-export commonly used types
export type { AnimationStyle, AnimationSpeed };

const API_BASE = '/api';
const SETUP_SECRET_STORAGE_KEY = 'decidarr_setup_secret';

export function getStoredSetupSecret(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(SETUP_SECRET_STORAGE_KEY);
}

export function setStoredSetupSecret(secret: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SETUP_SECRET_STORAGE_KEY, secret);
}

function setupSecretHeaders(): Record<string, string> {
  const secret = getStoredSetupSecret();
  return secret ? { 'X-Decidarr-Setup-Secret': secret } : {};
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// Custom error class for authentication errors
export class AuthError extends Error {
  public isAuthError = true;
  public statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// Helper to check if an error is an auth error
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError || (error as AuthError)?.isAuthError === true;
}

// Custom error class for API errors with status and code
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

export class PlexLoginError extends Error {
  public code?: string;
  public statusCode: number;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'PlexLoginError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** The user-facing message for each sign-in error code; a Record so a new code cannot be missed. */
export const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  NO_OWNED_SERVER: 'No owned Plex server found. You need to own a Plex Media Server to use this app.',
  NO_SERVER_ACCESS:
    'Your Plex account does not have access to this server. Ask the server owner to share it with you.',
  NOT_APPROVED: 'Your account is not approved yet. Please wait for an administrator to approve your access.',
  SERVER_MISCONFIGURED: 'Decidarr is not fully set up yet. Ask the server owner to finish setup.',
  AUTH_FAILED: 'Plex sign-in failed. Please try again.',
  PLEX_UNAVAILABLE: 'Plex.tv is unavailable. Please try again later.',
  PLEX_PIN_EXPIRED: 'Plex authorization expired, please try again.',
  RATE_LIMITED: 'Too many sign-in attempts. Please wait a few minutes and try again.',
  MISSING_OAUTH_COOKIES: 'Your sign-in session was lost. Please start sign-in again.',
  INVALID_OAUTH_PIN: 'Sign-in could not be verified. Please start sign-in again.',
  INVALID_OAUTH_STATE: 'Sign-in could not be verified. Please start sign-in again.',
  SETUP_SECRET_REQUIRED: 'Setup is locked until the server owner sets DECIDARR_SETUP_SECRET.',
  INVALID_SETUP_SECRET: 'The setup secret is incorrect.',
  LOGIN_FAILED: 'Sign-in failed. Please try again.',
};

function isLoginErrorCode(code: string | undefined): code is LoginErrorCode {
  return code !== undefined && Object.prototype.hasOwnProperty.call(LOGIN_ERROR_MESSAGES, code);
}

/** Sign-in errors come from the poll (PlexLoginError) and the start route (ApiError). */
export function formatPlexLoginError(error: unknown): string {
  if (error instanceof PlexLoginError || error instanceof ApiError) {
    if (isLoginErrorCode(error.code)) {
      return LOGIN_ERROR_MESSAGES[error.code];
    }
    const status = error instanceof PlexLoginError ? error.statusCode : error.status;
    if (status === 503) {
      return LOGIN_ERROR_MESSAGES.PLEX_UNAVAILABLE;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Login failed';
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    signal: options.signal,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = errorData.error || errorData.message || 'Request failed';
    const errorCode = errorData.code;

    if (response.status === 401) {
      console.warn(`[API] 401 Unauthorized on ${endpoint}:`, errorMessage);
      // Throw a typed AuthError instead of auto-redirecting
      // This lets components decide how to handle the auth failure
      throw new AuthError(errorMessage, 401);
    }

    throw new ApiError(errorMessage, response.status, errorCode);
  }

  return response.json();
}

export interface AuthUser {
  id: string;
  username: string;
  serverUrl: string;
  thumb?: string;
  isAdmin: boolean;
}

export const authApi = {
  getCurrentUser: () =>
    request<{ user: AuthUser; preferences: UserPreferences; expiresAt: number }>('/auth/me'),
  startPlexLogin: () =>
    request<{ authUrl: string; pinId: number; state: string }>('/auth/plex/start', {
      method: 'POST',
      headers: setupSecretHeaders(),
    }),
  pollPlexLogin: async (state: string) => {
    const response = await fetch(
      `${API_BASE}/auth/plex/poll?state=${encodeURIComponent(state)}`,
      { credentials: 'include' }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PlexLoginError(
        data.error || 'Login failed',
        response.status,
        data.code as string | undefined
      );
    }
    return data as {
      authorized: boolean;
      success?: boolean;
      user?: AuthUser;
      error?: string;
      code?: string;
    };
  },
  refreshSession: () => request<{ success: boolean; expiresAt: number }>('/auth/refresh', { method: 'POST' }),
  logout: () => request('/auth/logout', { method: 'DELETE' }),
};

export interface PlexFriendUser {
  id: string;
  username: string;
  thumb?: string;
  hasServerAccess: boolean;
  isApproved: boolean;
}

export const adminUsersApi = {
  list: () => request<{ users: PlexFriendUser[] }>('/admin/users'),
  setApproved: (plexUserId: string, approved: boolean) =>
    request<{ success: boolean }>(`/admin/users/${encodeURIComponent(plexUserId)}`, {
      method: 'PUT',
      body: { approved },
    }),
};

export const userPreferencesApi = {
  get: () =>
    request<{ preferences: UserPreferences; spinHistory: SpinHistoryPreferences }>(
      '/users/me/preferences'
    ),
  update: (preferences: Partial<UserPreferences>) =>
    request<{ success: boolean; preferences: UserPreferences }>('/users/me/preferences', {
      method: 'PUT',
      body: preferences,
    }),
  updateSpinHistory: (spinHistory: Partial<SpinHistoryPreferences>) =>
    request<{ spinHistory: SpinHistoryPreferences }>('/users/me/preferences', {
      method: 'PATCH',
      body: { spinHistory },
    }),
};

// Library API
export interface PlexCollection {
  ratingKey: string;
  title: string;
  childCount: number;
  libraryId: string;
}

export const libraryApi = {
  getSections: () => request<{ sections: unknown[] }>('/library/sections'),
  getItems: (id: string, forceRefresh = false) =>
    request<{ items: unknown[] }>(`/library/${id}/items?forceRefresh=${forceRefresh}`),
  getGenres: (libraryIds: string[]) =>
    request<{ genres: string[] }>(`/library/genres?libraryIds=${libraryIds.join(',')}`),
  getYears: (libraryIds: string[]) =>
    request<{ min: number; max: number }>(`/library/years?libraryIds=${libraryIds.join(',')}`),
  getStudios: () =>
    request<{ studios: { streaming: string[]; anime: string[]; traditional: string[] } }>(
      '/library/studios'
    ),
  getFilterOptions: (libraryIds: string[]) =>
    request<{
      contentRatings: string[];
      hasRatings: boolean;
      ratingRange: { min: number; max: number };
      studios: string[];
    }>(`/library/filter-options?libraryIds=${libraryIds.join(',')}`),
  getCollections: (libraryIds: string[]) =>
    request<{ collections: PlexCollection[] }>(`/library/collections?libraryIds=${libraryIds.join(',')}`),
};

// Selection API
export const selectionApi = {
  getRandom: (params: SelectionParameters) =>
    request<SelectionResultResponse>('/selection/random', {
      method: 'POST',
      body: params,
    }),
  getAwardCategories: () =>
    request<{ categories: { id: string; name: string; icon: string }[] }>(
      '/selection/awards/categories'
    ),
  getPoolCount: (params: Omit<SelectionParameters, 'tvSelectionMode'>, signal?: AbortSignal) =>
    request<{
      totalItems: number;
      matchingItems: number;
      filterBreakdown: {
        filterName: string;
        label: string;
        beforeCount: number;
        afterCount: number;
        itemsRemoved: number;
        causedEmpty: boolean;
      }[];
      emptyReason: string | null;
      dataStats: {
        itemsWithRating: number;
        itemsWithContentRating: number;
        itemsWithStudio: number;
        itemsWithYear: number;
        itemsWithGenres: number;
      };
      overseerrWarning?: string | null;
    }>('/selection/pool-count', {
      method: 'POST',
      body: params,
      signal,
    }),
};

// Watched API
export const watchedApi = {
  getAll: (mediaType?: string, page = 1, limit = 50) =>
    request<{ items: unknown[]; pagination: unknown }>(
      `/watched?mediaType=${mediaType || ''}&page=${page}&limit=${limit}`
    ),
  getStatus: (plexId: string) =>
    request<{ watched: boolean }>(`/watched/${encodeURIComponent(plexId)}`),
  markWatched: (plexId: string, mediaType: WatchedMediaType, title: string) =>
    request(`/watched/${plexId}`, {
      method: 'POST',
      body: { mediaType, title },
    }),
  markUnwatched: (plexId: string) =>
    request(`/watched/${plexId}`, { method: 'DELETE' }),
};

// Settings API
export interface UserPreferences {
  theme?: AppTheme;
  defaultMediaType?: MediaType;
  tvSelectionMode?: TvSelectionMode;
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  selectedLibraries?: string[];
  savedFilters?: Record<string, unknown>;
  spinHistory?: SpinHistoryPreferences;
}

export interface SettingsResponse {
  setupComplete: boolean;
  /** Stored credentials that cannot be decrypted with the current keys; kept until re-entered. */
  credentialsNeedingReentry: string[];
  plex: {
    serverUrl: string | null;
    username: string | null;
    machineId: string | null;
    hasToken: boolean;
    tokenMasked: string | null;
  };
  tmdb: {
    hasKey: boolean;
    keyMasked: string | null;
  };
  tautulli: {
    url: string | null;
    enabled: boolean;
    hasKey: boolean;
    keyMasked: string | null;
    syncIntervalMinutes: number;
    lastSync: string | null;
  };
  overseerr: {
    url: string | null;
    filterEnabled: boolean;
    hasKey: boolean;
    keyMasked: string | null;
    lastSyncAt: string | null;
    lastSyncOk: boolean;
  };
  syncFrequencyHours: number;
  uiPreferences: {
    theme: AppTheme;
    defaultMediaType: MediaType;
    tvSelectionMode: TvSelectionMode;
    animationStyle: AnimationStyle;
    animationSpeed: AnimationSpeed;
  };
}

export interface SettingsStatusResponse {
  setupComplete: boolean;
  hasPlexToken: boolean;
  hasPlexServer: boolean;
  hasTmdbKey: boolean;
}

export interface PlexTestResponse {
  valid: boolean;
  error?: string;
  user?: {
    username: string;
    email: string;
    thumb: string;
  };
  servers?: Array<{ name: string; uri: string }>;
  serverTest?: {
    valid: boolean;
    libraryCount: number;
  } | null;
}

export interface TmdbTestResponse {
  valid: boolean;
  error?: string;
  message?: string;
  imageBaseUrl?: string | null;
}

export const settingsApi = {
  // Get current settings (masked sensitive values)
  getSettings: () => request<SettingsResponse>('/settings'),

  // Check if app is configured (public endpoint)
  getStatus: () => request<SettingsStatusResponse>('/settings/status'),

  // Update settings
  updateSettings: (settings: {
    plex?: { token?: string; serverUrl?: string };
    tmdb?: { apiKey?: string };
    tautulli?: { url?: string; apiKey?: string; enabled?: boolean; syncIntervalMinutes?: number };
    overseerr?: { url?: string; apiKey?: string; filterEnabled?: boolean };
    syncFrequencyHours?: number;
    uiPreferences?: {
      theme?: AppTheme;
      defaultMediaType?: MediaType;
      tvSelectionMode?: TvSelectionMode;
      animationStyle?: AnimationStyle;
      animationSpeed?: AnimationSpeed;
    };
  }) =>
    request<{ success: boolean; settings: SettingsResponse }>('/settings', {
      method: 'PUT',
      body: settings,
    }),

  // Complete initial setup
  setup: (data: { tmdbApiKey?: string }) =>
    request<{
      success: boolean;
      message: string;
      plex: { username: string; serverUrl: string };
    }>('/settings/setup', {
      method: 'POST',
      body: data,
    }),

  // Test Plex connection
  testPlex: (plexToken: string, plexServerUrl?: string) =>
    request<PlexTestResponse>('/settings/test-plex', {
      method: 'POST',
      body: { plexToken, plexServerUrl },
    }),

  // Test TMDB API key
  testTmdb: (apiKey: string) =>
    request<TmdbTestResponse>('/settings/test-tmdb', {
      method: 'POST',
      body: { apiKey },
    }),
};

// Tautulli API
export interface TautulliUser {
  id: number;
  username: string;
  friendlyName: string;
}

export interface TautulliTestResponse {
  success: boolean;
  error?: string;
  users?: TautulliUser[];
}

export interface TautulliSyncResponse {
  success: boolean;
  synced: number;
  movies: number;
  shows: number;
  lastSync: string;
  error?: string;
}

export const tautulliApi = {
  test: (url: string, apiKey: string) =>
    request<TautulliTestResponse>('/tautulli/test', {
      method: 'POST',
      body: { url, apiKey },
    }),
  sync: () => request<TautulliSyncResponse>('/tautulli/sync', { method: 'POST' }),
};

// Spin History API
export interface SpinHistoryPreferences {
  enabled: boolean;
  retentionLimit: number;
  storeFilterSnapshot: boolean;
}

export interface SpinHistoryEntry {
  _id: string;
  userId: string;
  plexId: string;
  title: string;
  mediaType: MediaTypeWithEpisode;
  posterUrl?: string;
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Filters;
  tvSelectionMode?: TvSelectionMode;
  poolSizeAtSpin?: number;
  spunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSpinHistoryPayload {
  plexId: string;
  title: string;
  mediaType: MediaTypeWithEpisode;
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Filters;
  tvSelectionMode?: TvSelectionMode;
  poolSizeAtSpin?: number;
}

export const spinHistoryApi = {
  list: (page = 1, limit = 20) =>
    request<{ items: SpinHistoryEntry[]; total: number; page: number; pageSize: number }>(
      `/spin-history?page=${page}&limit=${limit}`
    ),
  create: (payload: CreateSpinHistoryPayload) =>
    request<{ entry?: SpinHistoryEntry; skipped?: boolean; reason?: string }>('/spin-history', {
      method: 'POST',
      body: payload,
    }),
  delete: (id: string) =>
    request<{ success: boolean }>(`/spin-history/${id}`, { method: 'DELETE' }),
  clearAll: () =>
    request<{ deleted: number }>('/spin-history', { method: 'DELETE' }),
};

export interface OverseerrTestResponse {
  success: boolean;
  error?: string;
  version?: string;
}

export interface OverseerrStatusResponse {
  configured: boolean;
  reachable: boolean | null;
  filterEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncOk: boolean;
  warning: string | null;
}

export const overseerrApi = {
  test: (url: string, apiKey: string) =>
    request<OverseerrTestResponse>('/overseerr/test', {
      method: 'POST',
      body: { url, apiKey },
    }),
  getStatus: () => request<OverseerrStatusResponse>('/overseerr/status'),
};
