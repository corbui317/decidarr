import type {
  MobileAuthExchangeResponse,
  MobileAuthRefreshResponse,
  MobileAuthStartResponse,
  SyncBootstrapResponse,
  SyncChangesResponse,
  SyncMutation,
  SyncMutationBatchResponse,
} from '@decidarr/api-contracts';
import { getApiBaseUrl } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', response.status, data.code);
  }

  return data as T;
}

export const mobileAuthApi = {
  start: (deviceId: string, deviceName?: string) =>
    request<MobileAuthStartResponse>('/mobile/auth/start', {
      method: 'POST',
      body: { deviceId, deviceName },
    }),
  exchange: (deviceCode: string, deviceId: string) =>
    request<MobileAuthExchangeResponse>('/mobile/auth/exchange', {
      method: 'POST',
      body: { deviceCode, deviceId },
    }),
  refresh: (refreshToken: string, deviceId: string) =>
    request<MobileAuthRefreshResponse>('/mobile/auth/refresh', {
      method: 'POST',
      body: { refreshToken, deviceId },
    }),
  logout: (accessToken: string, refreshToken?: string) =>
    request<{ success: boolean }>('/mobile/auth/logout', {
      method: 'POST',
      accessToken,
      body: { refreshToken },
    }),
};

export const syncApi = {
  bootstrap: (accessToken: string) =>
    request<SyncBootstrapResponse>('/v1/sync/bootstrap', { accessToken }),
  changes: (accessToken: string, cursor: string, limit = 100) =>
    request<SyncChangesResponse>(
      `/v1/sync/changes?cursor=${encodeURIComponent(cursor)}&limit=${limit}`,
      { accessToken }
    ),
  mutations: (accessToken: string, mutations: SyncMutation[]) =>
    request<SyncMutationBatchResponse>('/v1/sync/mutations', {
      method: 'POST',
      accessToken,
      body: { mutations },
    }),
};

export const coreApi = {
  getSections: (accessToken: string) =>
    request<{ sections: Array<{ id: string; title: string; type: string }> }>(
      '/library/sections',
      { accessToken }
    ),
  spin: (
    accessToken: string,
    body: {
      libraryIds: string[];
      mediaType: 'movie' | 'show';
      filters: Record<string, unknown>;
      tvSelectionMode?: 'show' | 'episode';
    }
  ) =>
    request<{
      item: {
        title: string;
        year?: number;
        thumbPath?: string;
        plexId: string;
        mediaType: string;
        playLinks?: { ios?: string; android?: string; web?: string };
      };
      poolSize: number;
    }>('/selection/random', {
      method: 'POST',
      accessToken,
      body,
    }),
  getPreferences: (accessToken: string) =>
    request<{ preferences: Record<string, unknown> }>('/users/me/preferences', {
      accessToken,
    }),
  updatePreferences: (accessToken: string, preferences: Record<string, unknown>) =>
    request('/users/me/preferences', {
      method: 'PUT',
      accessToken,
      body: preferences,
    }),
  markWatched: (
    accessToken: string,
    plexId: string,
    mediaType: string,
    title: string
  ) =>
    request(`/watched/${encodeURIComponent(plexId)}`, {
      method: 'POST',
      accessToken,
      body: { mediaType, title },
    }),
  recordSpinHistory: (accessToken: string, entry: Record<string, unknown>) =>
    request('/spin-history', {
      method: 'POST',
      accessToken,
      body: entry,
    }),
};
