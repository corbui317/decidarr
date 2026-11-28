'use client';

import { createApiClient, createWebTransport, ApiError } from '@decidarr/api-contracts';
import type { LoginErrorCode } from './auth-errors';
import type { Transport, AnimationStyle, AnimationSpeed, MediaTypeWithEpisode } from '@decidarr/api-contracts';

export { ApiError };

// Re-export commonly used types
export type { AnimationStyle, AnimationSpeed };

// Re-export the contract types the web app keys its API responses on, so callers
// import them from here rather than duplicating them.
export type {
  AuthUser,
  PlexFriendUser,
  PreferenceContract as UserPreferences,
  SpinHistoryPreferencesContract as SpinHistoryPreferences,
  SpinHistoryEntryResponse as SpinHistoryEntry,
  SpinHistoryCreateBody as CreateSpinHistoryPayload,
  PlexCollection,
  SettingsResponse,
  SettingsStatusResponse,
  PlexTestResponse,
  TmdbTestResponse,
  TautulliUser,
  TautulliTestResponse,
  TautulliSyncResponse,
  OverseerrTestResponse,
  OverseerrStatusResponse,
} from '@decidarr/api-contracts';

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

const transport = createWebTransport({ baseUrl: API_BASE });

type AuthErrorListener = () => void;
const authErrorListeners = new Set<AuthErrorListener>();

/**
 * Notified whenever any authenticated call gets a 401 that means the session itself
 * is no longer valid - not only /auth/me or the scheduled refresh, and not a
 * PLEX_SIGN_IN_REQUIRED 401, which means the session is still valid but this user's
 * Plex access needs a fresh sign-in; components handle that locally (e.g.
 * LibrarySelector's own "Sign in again" button) while staying signed in to Decidarr.
 * AuthContext subscribes so a session revoked mid-use (logout elsewhere, un-approval,
 * the 30-day absolute lifetime) clears the signed-in state no matter which call
 * surfaced it.
 */
export function onAuthError(listener: AuthErrorListener): () => void {
  authErrorListeners.add(listener);
  return () => authErrorListeners.delete(listener);
}

/** Converts a 401 into a typed AuthError so components can tell "unauthenticated" apart from other failures. */
const authConvertingTransport: Transport = {
  async request(path, options) {
    try {
      return await transport.request(path, options);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        console.warn(`[API] 401 Unauthorized on ${path}:`, error.message);
        if (error.code !== 'PLEX_SIGN_IN_REQUIRED') {
          authErrorListeners.forEach((listener) => listener());
        }
        throw new AuthError(error.message, 401);
      }
      throw error;
    }
  },
};

const client = createApiClient(authConvertingTransport);
// Plex sign-in happens before any session exists, so a 401 there is not an AuthError;
// it is converted to PlexLoginError below instead.
const loginClient = createApiClient(transport);

export const authApi = {
  getCurrentUser: () => client.auth.getCurrentUser(),
  startPlexLogin: () => loginClient.auth.startPlexLogin(setupSecretHeaders()),
  pollPlexLogin: async (state: string) => {
    try {
      return await loginClient.auth.pollPlexLogin(state);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new PlexLoginError(error.message, error.status, error.code);
      }
      throw error;
    }
  },
  refreshSession: () => client.auth.refreshSession(),
  logout: () => client.auth.logout(),
};

export const adminUsersApi = {
  list: () => client.admin.listUsers(),
  setApproved: (plexUserId: string, approved: boolean) => client.admin.setApproved(plexUserId, approved),
};

export const userPreferencesApi = {
  get: () => client.preferences.get(),
  update: client.preferences.update,
  updateSpinHistory: client.preferences.updateSpinHistory,
};

export const libraryApi = {
  getSections: () => client.library.getSections(),
  getItems: client.library.getItems,
  getGenres: client.library.getGenres,
  getYears: client.library.getYears,
  getStudios: () => client.library.getStudios(),
  getFilterOptions: client.library.getFilterOptions,
  getCollections: client.library.getCollections,
};

export const selectionApi = {
  getRandom: client.selection.random,
  getAwardCategories: () => client.selection.getAwardCategories(),
  getPoolCount: client.selection.poolCount,
};

export const watchedApi = {
  getAll: client.watched.getAll,
  getStatus: client.watched.getStatus,
  markWatched: (plexId: string, mediaType: MediaTypeWithEpisode, title: string) =>
    client.watched.markWatched(plexId, { mediaType, title }),
  markUnwatched: client.watched.markUnwatched,
};

export const settingsApi = {
  getSettings: () => client.settings.getSettings(),
  getStatus: () => client.settings.getStatus(),
  updateSettings: client.settings.updateSettings,
  setup: client.settings.setup,
  testPlex: client.settings.testPlex,
  testTmdb: client.settings.testTmdb,
};

export const tautulliApi = {
  test: client.tautulli.test,
  sync: () => client.tautulli.sync(),
};

export const spinHistoryApi = {
  list: client.spinHistory.list,
  create: client.spinHistory.create,
  delete: client.spinHistory.delete,
  clearAll: () => client.spinHistory.clearAll(),
};

export const overseerrApi = {
  test: client.overseerr.test,
  getStatus: () => client.overseerr.getStatus(),
};
