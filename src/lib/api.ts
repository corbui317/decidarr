'use client';

import type { Filters } from '@/types/filters';
import type { SelectionResultResponse } from '@/types/api/selection';
import type { MediaType, TvSelectionMode } from '@/lib/validation/selection';
import type { WatchedMediaType } from '@/lib/validation/watched';

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

export function isPlexLoginError(error: unknown): error is PlexLoginError {
  return error instanceof PlexLoginError;
}

function plexLoginErrorMessage(error: PlexLoginError): string {
  if (error.code === 'PLEX_PIN_EXPIRED') {
    return 'Plex authorization expired, please try again.';
  }
  if (error.code === 'PLEX_UNAVAILABLE' || error.statusCode === 503) {
    return 'Plex.tv is unavailable. Please try again later.';
  }
  return error.message;
}

export function formatPlexLoginError(error: unknown): string {
  if (isPlexLoginError(error)) {
    return plexLoginErrorMessage(error);
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
    const errorMessage = errorData.error || 'Request failed';
    
    if (response.status === 401) {
      console.warn(`[API] 401 Unauthorized on ${endpoint}:`, errorMessage);
      // Throw a typed AuthError instead of auto-redirecting
      // This lets components decide how to handle the auth failure
      throw new AuthError(errorMessage, 401);
    }
    
    throw new Error(errorMessage);
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
    request<{ user: AuthUser; preferences: UserPreferences }>('/auth/me'),
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
  refreshSession: () => request<{ success: boolean }>('/auth/refresh', { method: 'POST' }),
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
  getRandom: (
    libraryIds: string[],
    mediaType: MediaType,
    filters: Filters,
    tvSelectionMode?: TvSelectionMode
  ) =>
    request<SelectionResultResponse>('/selection/random', {
      method: 'POST',
      body: { libraryIds, mediaType, filters, tvSelectionMode },
    }),
  getAwardCategories: () =>
    request<{ categories: { id: string; name: string; icon: string }[] }>(
      '/selection/awards/categories'
    ),
  getPoolCount: (
    libraryIds: string[],
    mediaType: MediaType,
    filters: Filters,
    signal?: AbortSignal
  ) =>
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
      body: { libraryIds, mediaType, filters },
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
export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';
export type AnimationStyle = 'slots' | 'roulette' | 'wheel' | 'plinko' | 'random';
export type AnimationSpeed = 'fast' | 'normal' | 'dramatic';

export interface UserPreferences {
  theme?: AppTheme;
  defaultMediaType?: 'movie' | 'show';
  tvSelectionMode?: 'show' | 'episode';
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  selectedLibraries?: string[];
  savedFilters?: Record<string, unknown>;
  spinHistory?: SpinHistoryPreferences;
}

export interface SettingsResponse {
  setupComplete: boolean;
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
    defaultMediaType: 'movie' | 'show';
    tvSelectionMode: 'show' | 'episode';
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
      defaultMediaType?: 'movie' | 'show';
      tvSelectionMode?: 'show' | 'episode';
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
  mediaType: 'movie' | 'show' | 'episode';
  posterUrl?: string;
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Filters;
  tvSelectionMode?: 'show' | 'episode';
  poolSizeAtSpin?: number;
  spunAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSpinHistoryPayload {
  plexId: string;
  title: string;
  mediaType: 'movie' | 'show' | 'episode';
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Filters;
  tvSelectionMode?: 'show' | 'episode';
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
