export const SYNC_SCHEMA_VERSION = 1;

export type SyncEntityType = 'preference' | 'watched' | 'spin_history';

export interface SyncMetadata {
  userId: string;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncChange<T = unknown> {
  cursor: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  revision: number;
  changedAt: string;
  data: T | null;
}

export interface SyncMutation<T = unknown> {
  mutationId: string;
  deviceId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  baseRevision: number | null;
  clientChangedAt: string;
  payload: T;
}

export type AppTheme = 'dark' | 'light' | 'vegas' | 'macao' | 'poker';
export type AnimationStyle = 'slots' | 'roulette' | 'wheel' | 'plinko' | 'random';
export type AnimationSpeed = 'fast' | 'normal' | 'dramatic';
export type MediaType = 'movie' | 'show' | 'episode';

export interface SpinHistoryPreferencesContract {
  enabled: boolean;
  retentionLimit: number;
  storeFilterSnapshot: boolean;
}

export interface PreferenceContract {
  theme?: AppTheme;
  selectedLibraries?: string[];
  defaultMediaType?: 'movie' | 'show';
  tvSelectionMode?: 'show' | 'episode';
  animationStyle?: AnimationStyle;
  animationSpeed?: AnimationSpeed;
  savedFilters?: {
    genres?: string[];
    yearRange?: { start?: number; end?: number };
    collections?: string[];
    unwatchedOnly?: boolean;
  };
  spinHistory?: SpinHistoryPreferencesContract;
}

export interface WatchedContract {
  id: string;
  plexId: string;
  mediaType: MediaType;
  title: string;
  watchedAt: string;
  markedManually: boolean;
  source: 'manual' | 'tautulli';
}

export interface SpinHistoryContract {
  id: string;
  plexId: string;
  title: string;
  mediaType: MediaType;
  thumbPath?: string;
  year?: number;
  libraryIds: string[];
  filtersSnapshot?: Record<string, unknown>;
  tvSelectionMode?: 'show' | 'episode';
  poolSizeAtSpin?: number;
  spunAt: string;
}

export interface SyncBootstrapResponse {
  schemaVersion: number;
  cursor: string;
  serverTime: string;
  entities: {
    preferences: PreferenceContract;
    watched: WatchedContract[];
    spinHistory: SpinHistoryContract[];
  };
}

export interface SyncChangesResponse {
  schemaVersion: number;
  changes: SyncChange[];
  nextCursor: string;
  hasMore: boolean;
  serverTime: string;
}

export type MutationResult =
  | { mutationId: string; status: 'applied'; revision: number }
  | { mutationId: string; status: 'duplicate'; revision: number }
  | {
      mutationId: string;
      status: 'conflict';
      reason: 'revision_mismatch' | 'deleted' | 'validation';
      serverRevision: number | null;
      serverValue: unknown;
    };

export interface SyncMutationBatchResponse {
  results: MutationResult[];
  nextCursor: string;
}

export interface MobileAuthStartRequest {
  deviceId: string;
  deviceName?: string;
}

export interface MobileAuthStartResponse {
  authUrl: string;
  pinId: number;
  deviceCode: string;
  expiresAt: string;
}

export interface MobileAuthExchangeRequest {
  deviceCode: string;
  deviceId: string;
}

export interface MobileAuthExchangeResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    serverUrl: string;
    isAdmin: boolean;
    thumb?: string;
  };
}

export interface MobileAuthRefreshRequest {
  refreshToken: string;
  deviceId: string;
}

export interface MobileAuthRefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface MobileAuthLogoutRequest {
  refreshToken?: string;
}

export type SyncClientState =
  | 'signed_out'
  | 'authorizing'
  | 'bootstrapping'
  | 'ready_online'
  | 'ready_offline'
  | 'syncing'
  | 'conflict'
  | 'reauth_required';

export const MAX_MUTATION_BATCH_SIZE = 50;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_SECONDS = 600;
export const SYNC_CHANGE_RETENTION_DAYS = 90;
