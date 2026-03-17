'use client';

const API_BASE = '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
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
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = '/';
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth API (simplified for single-user mode)
export const authApi = {
  getCurrentUser: () => request<{ user: { username: string; serverUrl: string }; preferences: unknown }>('/auth/me'),
  logout: () => request('/auth/logout', { method: 'DELETE' }),
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
    mediaType: string,
    filters: unknown,
    tvSelectionMode?: string
  ) =>
    request<{ selection: unknown; stats: { totalMatches: number } }>('/selection/random', {
      method: 'POST',
      body: { libraryIds, mediaType, filters, tvSelectionMode },
    }),
  getAwardCategories: () =>
    request<{ categories: { id: string; name: string; icon: string }[] }>(
      '/selection/awards/categories'
    ),
  getPoolCount: (libraryIds: string[], mediaType: string, filters: unknown) =>
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
    }>('/selection/pool-count', {
      method: 'POST',
      body: { libraryIds, mediaType, filters },
    }),
};

// Watched API
export const watchedApi = {
  getAll: (mediaType?: string, page = 1, limit = 50) =>
    request<{ items: unknown[]; pagination: unknown }>(
      `/watched?mediaType=${mediaType || ''}&page=${page}&limit=${limit}`
    ),
  markWatched: (plexId: string, mediaType: string, title: string) =>
    request(`/watched/${plexId}`, {
      method: 'POST',
      body: { mediaType, title },
    }),
  markUnwatched: (plexId: string) =>
    request(`/watched/${plexId}`, { method: 'DELETE' }),
};

// Settings API
export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';

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
  syncFrequencyHours: number;
  uiPreferences: {
    theme: AppTheme;
    defaultMediaType: 'movie' | 'show';
    tvSelectionMode: 'show' | 'episode';
  };
}

export interface SettingsStatusResponse {
  setupComplete: boolean;
  hasPlexToken: boolean;
  hasPlexServer: boolean;
  hasTmdbKey: boolean;
  plexUsername: string | null;
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
    syncFrequencyHours?: number;
    uiPreferences?: {
      theme?: AppTheme;
      defaultMediaType?: 'movie' | 'show';
      tvSelectionMode?: 'show' | 'episode';
    };
  }) =>
    request<{ success: boolean; settings: SettingsResponse }>('/settings', {
      method: 'PUT',
      body: settings,
    }),

  // Complete initial setup
  setup: (data: { plexToken: string; plexServerUrl?: string; tmdbApiKey?: string }) =>
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
